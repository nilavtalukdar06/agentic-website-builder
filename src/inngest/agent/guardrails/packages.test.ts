import { describe, expect, test } from "vitest";
import {
  npqCommand,
  packageName,
  parseNpqReport,
  planInstall,
  refusedSpec,
  summarizeNpq,
  unknownDependencies,
} from "./packages";

describe("package policy", () => {
  test("extracts names from specs", () => {
    expect(packageName("@tanstack/react-query@5")).toBe(
      "@tanstack/react-query",
    );
    expect(packageName("zod@^4")).toBe("zod");
    expect(packageName("left-pad")).toBe("left-pad");
  });

  test.each([
    "git+https://github.com/a/b.git",
    "github:a/b",
    "https://example.com/pkg.tgz",
    "./local",
    "file:../x",
    "a/b",
    "pkg.tgz",
  ])("refuses %s", (spec) => {
    expect(refusedSpec(spec)).toMatch(/npm registry by name/);
  });

  test("runs vetted packages without install scripts", () => {
    expect(planInstall("npm install framer-motion zod")).toEqual({
      action: "run",
      command: "npm install framer-motion zod --ignore-scripts",
      unknown: [],
      installs: 2,
      bare: false,
    });
    expect(planInstall("npm i sharp")).toMatchObject({
      command: "npm i sharp",
      unknown: [],
    });
  });

  test("flags unknown packages unless approved earlier", () => {
    expect(planInstall("pnpm add left-pad && npm run lint")).toMatchObject({
      unknown: ["left-pad"],
      command: "pnpm add left-pad --ignore-scripts && npm run lint",
    });
    expect(planInstall("npm install left-pad", ["left-pad"])).toMatchObject({
      unknown: [],
    });
    expect(planInstall("npx cowsay hi")).toMatchObject({
      unknown: ["cowsay"],
      installs: 1,
    });
    expect(planInstall("npx shadcn@latest add button")).toMatchObject({
      unknown: [],
      installs: 0,
    });
  });

  test("refuses URL dependencies and ignores other commands", () => {
    expect(planInstall("npm install github:evil/pkg")).toMatchObject({
      action: "refuse",
    });
    expect(planInstall("ls -la")).toEqual({ action: "none" });
    expect(planInstall("npm install")).toMatchObject({ bare: true });
  });

  test("audits package.json for bare installs", () => {
    expect(
      unknownDependencies(
        JSON.stringify({
          dependencies: { react: "19", "left-pad": "1", evil: "github:a/b" },
          devDependencies: { typescript: "5" },
        }),
      ),
    ).toEqual({
      refused: "evil points to github:a/b",
      unknown: ["evil", "left-pad"],
    });
  });

  test("parses and summarizes npq's JSON audit", () => {
    const report = parseNpqReport(
      JSON.stringify({
        status: "findings",
        summary: { errors: 1, warnings: 1 },
        packages: [
          {
            requested: "left-pad@*",
            findings: [
              {
                severity: "error",
                marshall: "deprecation",
                message: "Package deprecated",
              },
              { severity: "warning", marshall: "age", message: "old" },
            ],
          },
        ],
      }),
    );
    expect(report).toMatchObject({ errors: 1, warnings: 1 });
    expect(summarizeNpq(["left-pad"], report)).toContain(
      "left-pad: error (deprecation) Package deprecated",
    );
    expect(summarizeNpq(["x"], null)).toMatch(/couldn't run/);
    expect(parseNpqReport("not json")).toBeNull();
  });

  test("runs the pinned npq with a fallback", () => {
    expect(npqCommand(["left-pad"])).toBe(
      "(command -v npq >/dev/null && npq install 'left-pad' --json) || npx --yes npq@3.27.4 install 'left-pad' --json",
    );
  });
});
