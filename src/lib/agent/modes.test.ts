import { describe, expect, test } from "vitest";
import { fromDbMode, isAgentMode, toDbMode } from "./modes";

describe("agent modes", () => {
  test("maps to and from the database enum", () => {
    expect(toDbMode("fast")).toBe("FAST");
    expect(toDbMode("standard")).toBe("STANDARD");
    expect(fromDbMode("FAST")).toBe("fast");
    expect(fromDbMode("STANDARD")).toBe("standard");
    expect(fromDbMode(null)).toBe("standard");
  });

  test("recognises only known modes", () => {
    expect(isAgentMode("fast")).toBe(true);
    expect(isAgentMode("standard")).toBe(true);
    expect(isAgentMode("turbo")).toBe(false);
    expect(isAgentMode(null)).toBe(false);
  });
});
