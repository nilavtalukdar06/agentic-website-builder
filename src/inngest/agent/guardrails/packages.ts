export const MAX_INSTALLS_PER_RUN = 20;
export const NPQ_VERSION = "3.27.4";

const allowedNames = new Set([
  "react",
  "react-dom",
  "next",
  "zod",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "lucide-react",
  "motion",
  "framer-motion",
  "date-fns",
  "date-fns-tz",
  "dayjs",
  "recharts",
  "three",
  "embla-carousel-react",
  "embla-carousel-autoplay",
  "react-hook-form",
  "sonner",
  "next-themes",
  "cmdk",
  "vaul",
  "react-day-picker",
  "input-otp",
  "react-resizable-panels",
  "swr",
  "axios",
  "ky",
  "uuid",
  "nanoid",
  "lodash",
  "lodash-es",
  "marked",
  "react-markdown",
  "remark-gfm",
  "gsap",
  "canvas-confetti",
  "chart.js",
  "react-chartjs-2",
  "d3",
  "leaflet",
  "react-leaflet",
  "qrcode",
  "qrcode.react",
  "react-icons",
  "simple-icons",
  "ai",
  "prisma",
  "ws",
  "inngest",
  "zustand",
  "jotai",
  "immer",
  "superjson",
  "react-intersection-observer",
  "use-debounce",
  "usehooks-ts",
  "tw-animate-css",
  "tailwindcss",
  "postcss",
  "autoprefixer",
  "typescript",
  "eslint",
  "prettier",
  "sharp",
  "esbuild",
  "shiki",
  "highlight.js",
  "prismjs",
  "fuse.js",
  "papaparse",
  "stripe",
  "resend",
  "openai",
  "better-auth",
  "dotenv",
  "server-only",
  "client-only",
]);

const allowedScopes = [
  "@radix-ui/",
  "@base-ui/",
  "@tanstack/",
  "@types/",
  "@react-three/",
  "@ai-sdk/",
  "@prisma/",
  "@neondatabase/",
  "@tiptap/",
  "@dnd-kit/",
  "@fontsource/",
  "@fontsource-variable/",
  "@hookform/",
  "@heroicons/",
  "@gsap/",
  "@tailwindcss/",
  "@stripe/",
  "@anthropic-ai/",
  "@google/",
  "@vercel/",
  "@next/",
];

const needsScripts = new Set([
  "sharp",
  "esbuild",
  "prisma",
  "@prisma/client",
  "@prisma/engines",
]);

const npxTools = new Set([
  "shadcn",
  "tsc",
  "typescript",
  "eslint",
  "prettier",
  "prisma",
  "next",
  "npq",
]);

export function isAllowedPackage(name: string) {
  return (
    allowedNames.has(name) ||
    allowedScopes.some((scope) => name.startsWith(scope))
  );
}

export function packageName(spec: string) {
  const at = spec.startsWith("@") ? spec.indexOf("@", 1) : spec.indexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

export function refusedSpec(spec: string) {
  if (
    /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:|portal:|workspace:|npm:)/i.test(
      spec,
    ) ||
    /^(\.{1,2}\/|\/|~)/.test(spec) ||
    /\.(tgz|tar\.gz|tar)$/i.test(spec) ||
    (!spec.startsWith("@") && spec.includes("/"))
  ) {
    return `${spec} is a git, URL, file or tarball dependency; install packages from the npm registry by name`;
  }
  if (
    !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*|+ -]+)?$/i.test(spec)
  ) {
    return `${spec} is not a valid package name`;
  }
  return null;
}

const managers =
  /^(npm\s+(?:install|i|add|ci)|pnpm\s+(?:add|install|i)|yarn(?:\s+(?:add|install))?|bun\s+(?:add|install|i))\b(.*)$/;
const npxPattern = /^(npx|bunx|pnpm\s+dlx)\s+(.*)$/;

export type InstallSegment =
  | { kind: "install"; segment: string; specs: string[] }
  | { kind: "npx"; segment: string; spec: string };

export function splitSegments(command: string) {
  return command
    .split(/&&|\|\||;/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseInstalls(command: string): InstallSegment[] {
  return splitSegments(command).flatMap((segment): InstallSegment[] => {
    const install = managers.exec(segment);
    if (install) {
      const specs = install[2]
        .trim()
        .split(/\s+/)
        .filter((token) => token && !token.startsWith("-"));
      return [{ kind: "install", segment, specs }];
    }
    const npx = npxPattern.exec(segment);
    if (npx) {
      const spec = npx[2]
        .trim()
        .split(/\s+/)
        .find((token) => token && !token.startsWith("-"));
      return spec ? [{ kind: "npx", segment, spec }] : [];
    }
    return [];
  });
}

export type InstallPlan =
  | { action: "none" }
  | { action: "refuse"; reason: string }
  | {
      action: "run";
      command: string;
      unknown: string[];
      installs: number;
      bare: boolean;
    };

function withIgnoreScripts(segment: string) {
  return /--ignore-scripts\b/.test(segment)
    ? segment
    : `${segment} --ignore-scripts`;
}

export function planInstall(
  command: string,
  approved: readonly string[] = [],
): InstallPlan {
  const segments = parseInstalls(command);
  if (segments.length === 0) return { action: "none" };
  const unknown = new Set<string>();
  let rewritten = command;
  let installs = 0;
  let bare = false;
  for (const entry of segments) {
    if (entry.kind === "npx") {
      const name = packageName(entry.spec);
      if (npxTools.has(name)) continue;
      const refused = refusedSpec(entry.spec);
      if (refused) return { action: "refuse", reason: refused };
      if (!isAllowedPackage(name) && !approved.includes(name))
        unknown.add(name);
      installs += 1;
      continue;
    }
    if (entry.specs.length === 0) {
      bare = true;
      installs += 1;
      continue;
    }
    for (const spec of entry.specs) {
      const refused = refusedSpec(spec);
      if (refused) return { action: "refuse", reason: refused };
      const name = packageName(spec);
      if (!isAllowedPackage(name) && !approved.includes(name))
        unknown.add(name);
    }
    installs += entry.specs.length;
    const names = entry.specs.map(packageName);
    if (!names.some((name) => needsScripts.has(name))) {
      rewritten = rewritten.replace(
        entry.segment,
        withIgnoreScripts(entry.segment),
      );
    }
  }
  return {
    action: "run",
    command: rewritten,
    unknown: [...unknown].sort(),
    installs,
    bare,
  };
}

export function unknownDependencies(
  packageJson: string,
  approved: readonly string[] = [],
) {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const entries = Object.entries({
      ...parsed.dependencies,
      ...parsed.devDependencies,
    });
    const refused = entries.find(
      ([, version]) =>
        /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:)/i.test(
          version,
        ) ||
        (!version.startsWith("npm:") && /^[\w.-]+\/[\w.-]+/.test(version)),
    );
    return {
      refused: refused ? `${refused[0]} points to ${refused[1]}` : null,
      unknown: entries
        .map(([name]) => name)
        .filter((name) => !isAllowedPackage(name) && !approved.includes(name))
        .sort(),
    };
  } catch {
    return { refused: null, unknown: [] };
  }
}

export type NpqFinding = {
  severity: "error" | "warning";
  marshall: string;
  message: string;
};

export type NpqReport = {
  status: string;
  errors: number;
  warnings: number;
  packages: { name: string; findings: NpqFinding[] }[];
};

export function parseNpqReport(stdout: string): NpqReport | null {
  const start = stdout.indexOf("{");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(stdout.slice(start)) as {
      status?: string;
      summary?: { errors?: number; warnings?: number };
      packages?: { requested?: string; findings?: NpqFinding[] }[];
    };
    return {
      status: parsed.status ?? "unknown",
      errors: parsed.summary?.errors ?? 0,
      warnings: parsed.summary?.warnings ?? 0,
      packages: (parsed.packages ?? []).map((entry) => ({
        name: packageName(entry.requested ?? ""),
        findings: (entry.findings ?? []).filter(
          (finding) =>
            finding.severity === "error" || finding.severity === "warning",
        ),
      })),
    };
  } catch {
    return null;
  }
}

export function npqCommand(names: readonly string[]) {
  const quoted = names.map((name) => `'${name.replace(/'/g, "")}'`).join(" ");
  return `(command -v npq >/dev/null && npq install ${quoted} --json) || npx --yes npq@${NPQ_VERSION} install ${quoted} --json`;
}

export function summarizeNpq(
  names: readonly string[],
  report: NpqReport | null,
) {
  if (!report) {
    return `Packages not on the vetted list: ${names.join(", ")}. The package check couldn't run, so nothing is known about them.`;
  }
  const lines = report.packages.flatMap((entry) =>
    entry.findings.map(
      (finding) =>
        `${entry.name}: ${finding.severity} (${finding.marshall}) ${finding.message}`,
    ),
  );
  const head = `Packages not on the vetted list: ${names.join(", ")}. npq found ${report.errors} error${report.errors === 1 ? "" : "s"} and ${report.warnings} warning${report.warnings === 1 ? "" : "s"}.`;
  return [head, ...lines.slice(0, 12)].join("\n");
}
