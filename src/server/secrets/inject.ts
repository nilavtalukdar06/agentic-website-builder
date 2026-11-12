import type { Sandbox } from "e2b";
import { APP_DIR } from "@/server/sandbox/guards";
import type { SecretValue } from "./redact";

export const ENV_FILE = `${APP_DIR}/.env.local`;
const DEV_PORT = 3000;

const providerHosts: { name: RegExp; hosts: string[] }[] = [
  { name: /^OPENAI_/, hosts: ["api.openai.com"] },
  { name: /^ANTHROPIC_/, hosts: ["api.anthropic.com"] },
  {
    name: /^(GOOGLE_GENERATIVE_AI_|GEMINI_)/,
    hosts: ["generativelanguage.googleapis.com"],
  },
  { name: /^AI_GATEWAY_/, hosts: ["ai-gateway.vercel.sh"] },
];

export const BASE_EGRESS = [
  "registry.npmjs.org",
  "github.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
  "raw.githubusercontent.com",
];

function quoteEnv(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function envFileContent(secrets: readonly SecretValue[]) {
  return `${secrets.map(({ name, value }) => `${name}=${quoteEnv(value)}`).join("\n")}\n`;
}

export function secretEnvs(secrets: readonly SecretValue[]) {
  return Object.fromEntries(secrets.map(({ name, value }) => [name, value]));
}

function neonHost(value: string) {
  try {
    const url = new URL(value);
    return url.protocol.startsWith("postgres") ? url.hostname : null;
  } catch {
    return null;
  }
}

export function egressAllowList(secrets: readonly SecretValue[]) {
  const hosts = new Set(BASE_EGRESS);
  for (const { name, value } of secrets) {
    const host = neonHost(value.trim());
    if (host) hosts.add(host);
    for (const provider of providerHosts) {
      if (provider.name.test(name)) provider.hosts.forEach((h) => hosts.add(h));
    }
  }
  return [...hosts].sort();
}

export async function injectSecrets(
  sandbox: Pick<Sandbox, "files" | "commands">,
  secrets: readonly SecretValue[],
) {
  if (secrets.length === 0) return false;
  await sandbox.files.write(ENV_FILE, envFileContent(secrets));
  await sandbox.commands.run(`chmod 600 ${ENV_FILE}`, { timeoutMs: 15_000 });
  return true;
}

export async function applyEgress(
  sandbox: Pick<Sandbox, "updateNetwork">,
  secrets: readonly SecretValue[],
) {
  if (secrets.length === 0) return null;
  const allowOut = egressAllowList(secrets);
  await sandbox.updateNetwork({ allowOut, denyOut: ["0.0.0.0/0"] });
  return allowOut;
}

export async function restartDevServer(sandbox: Pick<Sandbox, "commands">) {
  await sandbox.commands
    .run(`pkill -f "next dev" || true`, { timeoutMs: 15_000 })
    .catch(() => null);
  await sandbox.commands.run(`npx next dev --turbopack -p ${DEV_PORT}`, {
    cwd: APP_DIR,
    background: true,
  });
  await sandbox.commands
    .run(
      `for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:${DEV_PORT}/ && exit 0; sleep 1; done; exit 1`,
      { cwd: APP_DIR, timeoutMs: 90_000 },
    )
    .catch(() => null);
}

export async function prepareSandboxSecrets(
  sandbox: Pick<Sandbox, "files" | "commands" | "updateNetwork">,
  secrets: readonly SecretValue[],
  { restart }: { restart: boolean },
) {
  if (secrets.length === 0) return;
  await injectSecrets(sandbox, secrets);
  await applyEgress(sandbox, secrets).catch((error) =>
    console.warn("[secrets] couldn't apply the egress allowlist", error),
  );
  if (restart) await restartDevServer(sandbox);
}
