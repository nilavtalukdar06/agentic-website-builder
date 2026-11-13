import { describe, expect, test } from "vitest";
import { agentRun } from "./events";

const handoff = {
  note: "Hero done, footer left.",
  written: ["app/page.tsx"],
  readAgentsMd: true,
  loadedSkills: ["shadcn"],
  installs: 1,
};

describe("agent/run handoff", () => {
  test("carries the searches used and the review restriction", () => {
    const data = {
      projectId: "p1",
      userId: "u1",
      messageId: "m1",
      resume: {
        chainId: "r0",
        handoff: { ...handoff, searches: 4, restricted: true },
      },
    };
    expect(agentRun.schema.parse(data)).toEqual(data);
  });

  test("older handoff events without them still parse", () => {
    const parsed = agentRun.schema.parse({
      projectId: "p1",
      userId: "u1",
      messageId: "m1",
      resume: { chainId: "r0", handoff },
    });
    expect(parsed.resume?.handoff?.restricted).toBeUndefined();
  });
});
