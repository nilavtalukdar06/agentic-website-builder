import { describe, expect, test } from "vitest";
import {
  agentPartsSchema,
  packagesFromInstall,
  parseAgentParts,
} from "./parts";

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

  test("parses sources", () => {
    const parts = [
      {
        type: "sources",
        sources: [{ title: "Acme", url: "https://acme.test" }],
      },
    ];
    expect(agentPartsSchema.parse(parts)).toEqual(parts);
  });

  test("rejects unknown parts", () => {
    expect(() => agentPartsSchema.parse([{ type: "nope" }])).toThrow();
  });
});

describe("parseAgentParts", () => {
  test("skips parts from before the simplification and drops agent tags", () => {
    const parts = parseAgentParts([
      {
        type: "agent",
        name: "researcher",
        state: "done",
        skills: [],
        searches: 2,
      },
      {
        type: "input-request",
        requestId: "i1",
        payload: { kind: "text", question: "Name?" },
      },
      { type: "input-answer", requestId: "i1", kind: "text", answer: "x" },
      {
        type: "task",
        title: "First version",
        items: [
          {
            kind: "file",
            verb: "created",
            path: "app/page.tsx",
            lines: 3,
            agent: "builder",
          },
        ],
      },
      {
        type: "tool",
        callId: "c1",
        name: "terminal",
        command: "npx tsc --noEmit",
        output: "",
        exitCode: 0,
        agent: "reviewer",
      },
      { type: "text", text: "Done" },
    ]);
    expect(parts).toEqual([
      {
        type: "task",
        title: "First version",
        items: [
          { kind: "file", verb: "created", path: "app/page.tsx", lines: 3 },
        ],
      },
      {
        type: "tool",
        callId: "c1",
        name: "terminal",
        command: "npx tsc --noEmit",
        output: "",
        exitCode: 0,
      },
      { type: "text", text: "Done" },
    ]);
  });

  test("returns null for something that isn't a parts list", () => {
    expect(parseAgentParts(null)).toBeNull();
    expect(parseAgentParts({ type: "text" })).toBeNull();
    expect(parseAgentParts([{ type: "text" }])).toBeNull();
  });
});
