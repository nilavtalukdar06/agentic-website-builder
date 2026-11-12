import { describe, expect, test, vi } from "vitest";
import {
  BASE_EGRESS,
  egressAllowList,
  ENV_FILE,
  envFileContent,
  injectSecrets,
  applyEgress,
} from "./inject";

const secrets = [
  { name: "OPENAI_API_KEY", value: 'sk-"quoted"' },
  {
    name: "DATABASE_URL",
    value: "postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/db",
  },
];

describe("secret injection", () => {
  test("writes a quoted env file", () => {
    expect(envFileContent(secrets)).toBe(
      'OPENAI_API_KEY="sk-\\"quoted\\""\nDATABASE_URL="postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/db"\n',
    );
  });

  test("allows the registry, GitHub, the Neon host and the provider", () => {
    const allow = egressAllowList(secrets);
    for (const host of BASE_EGRESS) expect(allow).toContain(host);
    expect(allow).toContain("ep-cool-1.us-east-2.aws.neon.tech");
    expect(allow).toContain("api.openai.com");
    expect(allow).not.toContain("api.anthropic.com");
  });

  test("writes .env.local with mode 600 through the files API", async () => {
    const sandbox = {
      files: { write: vi.fn().mockResolvedValue({}) },
      commands: { run: vi.fn().mockResolvedValue({}) },
    };
    await expect(injectSecrets(sandbox as never, secrets)).resolves.toBe(true);
    expect(sandbox.files.write).toHaveBeenCalledWith(
      ENV_FILE,
      envFileContent(secrets),
    );
    const [command] = sandbox.commands.run.mock.calls[0];
    expect(command).toBe(`chmod 600 ${ENV_FILE}`);
    expect(command).not.toContain("sk-");
    await expect(injectSecrets(sandbox as never, [])).resolves.toBe(false);
  });

  test("locks egress to the allowlist", async () => {
    const sandbox = { updateNetwork: vi.fn().mockResolvedValue(undefined) };
    await applyEgress(sandbox as never, secrets);
    expect(sandbox.updateNetwork).toHaveBeenCalledWith({
      allowOut: egressAllowList(secrets),
      denyOut: ["0.0.0.0/0"],
    });
    sandbox.updateNetwork.mockClear();
    await expect(applyEgress(sandbox as never, [])).resolves.toBeNull();
    expect(sandbox.updateNetwork).not.toHaveBeenCalled();
  });
});
