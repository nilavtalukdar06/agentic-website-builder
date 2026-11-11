import { describe, expect, test } from "vitest";
import { agentPartsSchema, packagesFromInstall } from "./parts";

describe("packagesFromInstall", () => {
  test.each([
    [
      "npm install framer-motion lucide-react",
      ["framer-motion", "lucide-react"],
    ],
    ["npm i -D @types/node", ["@types/node"]],
    ["pnpm add zod", ["zod"]],
    ["bun add date-fns", ["date-fns"]],
  ])("%j installs %j", (command, packages) => {
    expect(packagesFromInstall(command)).toEqual(packages);
  });

  test.each([
    "npm install",
    "npm install --no-audit",
    "ls",
    "npx shadcn add card",
  ])("%j installs nothing", (command) => {
    expect(packagesFromInstall(command)).toBeNull();
  });
});

describe("agentPartsSchema", () => {
  test("parses every part type", () => {
    const parts = [
      { type: "reasoning", text: "Plan", durationMs: 4000 },
      {
        type: "task",
        title: "Building Ember & Oak",
        items: [
          { kind: "sandbox", label: "Created sandbox" },
          { kind: "install", packages: ["framer-motion"] },
          { kind: "file", verb: "created", path: "app/page.tsx", lines: 24 },
        ],
      },
      {
        type: "tool",
        callId: "c1",
        name: "terminal",
        command: "ls",
        output: "app",
        exitCode: 0,
      },
      { type: "text", text: "Done" },
      { type: "error", message: "Failed" },
    ];
    expect(agentPartsSchema.parse(parts)).toEqual(parts);
  });

  test("rejects unknown parts", () => {
    expect(() => agentPartsSchema.parse([{ type: "nope" }])).toThrow();
  });
});
