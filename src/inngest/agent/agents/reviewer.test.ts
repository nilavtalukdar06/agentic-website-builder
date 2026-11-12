import { describe, expect, test } from "vitest";
import { builder } from "./builder";
import { designer } from "./designer";
import { hasFindings, reviewer } from "./reviewer";

describe("agent specs", () => {
  test("each role gets the skills and turn caps from the plan", () => {
    expect(designer.skills).toEqual(["frontend-design", "shadcn"]);
    expect(designer.maxTurns).toBe(4);
    expect(reviewer.skills).toHaveLength(5);
    expect(reviewer.maxTurns).toBe(8);
    expect(builder.skills).toHaveLength(5);
    expect(builder.maxTurns).toBe(Number.POSITIVE_INFINITY);
  });

  test("read-only roles can't write files", () => {
    expect(Object.keys(designer.tools)).toEqual(["readFiles", "loadSkill"]);
    expect(Object.keys(reviewer.tools)).not.toContain("createOrUpdateFiles");
    expect(Object.keys(builder.tools)).toContain("createOrUpdateFiles");
  });

  test("only the builder falls back to its plain reply", () => {
    expect(builder.textFallback).toBe(true);
    expect(designer.textFallback).toBe(false);
    expect(reviewer.textFallback).toBe(false);
    expect(
      reviewer.output("I'm sorry, but I cannot assist with that request."),
    ).toBeNull();
  });

  test("outputs are read from their tags", () => {
    expect(designer.output("x <brief>\nPalette\n</brief>")).toBe("Palette");
    expect(reviewer.output("<findings>none</findings>")).toBe("none");
    expect(builder.output("<task_summary>Done</task_summary>")).toBe("Done");
    expect(designer.output("no tags")).toBeNull();
  });
});

describe("hasFindings", () => {
  test.each([
    [null, false],
    ["none", false],
    ["None.", false],
    ['"none"', false],
    ["1. app/page.tsx: missing alt text", true],
  ])("%j → %s", (findings, expected) => {
    expect(hasFindings(findings)).toBe(expected);
  });
});
