import { describe, expect, test } from "vitest";
import {
  agentPartsSchema,
  inputPayloadSchema,
  inputQuestion,
  packagesFromInstall,
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

  test("parses the multi-agent parts and agent tags", () => {
    const parts = [
      {
        type: "agent",
        name: "researcher",
        state: "done",
        summary: "Acme sells anvils.",
        skills: [],
        searches: 2,
      },
      {
        type: "agent",
        name: "designer",
        state: "skipped",
        skills: ["frontend-design"],
        searches: 0,
      },
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
      {
        type: "sources",
        sources: [{ title: "Acme", url: "https://acme.test" }],
      },
    ];
    expect(agentPartsSchema.parse(parts)).toEqual(parts);
  });

  test("rejects unknown agent names", () => {
    expect(() =>
      agentPartsSchema.parse([
        {
          type: "agent",
          name: "hacker",
          state: "done",
          skills: [],
          searches: 0,
        },
      ]),
    ).toThrow();
  });

  test("rejects unknown parts", () => {
    expect(() => agentPartsSchema.parse([{ type: "nope" }])).toThrow();
  });
});

describe("input parts", () => {
  test("parses input requests and answers", () => {
    const parsed = agentPartsSchema.safeParse([
      {
        type: "input-request",
        requestId: "i1",
        agent: "builder",
        payload: {
          kind: "secret",
          name: "OPENAI_API_KEY",
          label: "OpenAI API key",
          url: "https://platform.openai.com/api-keys",
          reason: "AI chat",
        },
      },
      { type: "input-answer", requestId: "i1", kind: "secret", answer: "set" },
    ]);
    expect(parsed.success).toBe(true);
  });

  test("validates each kind's shape", () => {
    expect(
      inputPayloadSchema.safeParse({
        kind: "choice",
        question: "Q",
        options: ["a"],
      }).success,
    ).toBe(false);
    expect(
      inputPayloadSchema.safeParse({
        kind: "secret",
        name: "lower_case",
        label: "x",
        reason: "y",
      }).success,
    ).toBe(false);
    expect(
      inputPayloadSchema.safeParse({
        kind: "confirm",
        action: "Install x",
        risk: "extreme",
        summary: "s",
      }).success,
    ).toBe(false);
  });

  test("describes the question for each kind", () => {
    expect(
      inputQuestion({
        kind: "secret",
        name: "A_KEY",
        label: "A key",
        reason: "r",
      }),
    ).toBe("A key (A_KEY)");
    expect(
      inputQuestion({
        kind: "confirm",
        action: "Delete 12 files",
        risk: "high",
        summary: "s",
      }),
    ).toBe("Delete 12 files");
  });
});
