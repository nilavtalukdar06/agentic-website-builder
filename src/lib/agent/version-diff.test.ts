import { describe, expect, test } from "vitest";
import { diffVersions } from "./version-diff";

describe("diffVersions", () => {
  test("marks added and modified files", () => {
    expect(
      diffVersions(
        { "a.ts": "1", "b.ts": "2", "c.ts": "3" },
        { "a.ts": "1", "b.ts": "old" },
      ),
    ).toEqual({ "b.ts": "M", "c.ts": "A" });
  });

  test("the first version has no markers", () => {
    expect(diffVersions({ "a.ts": "1" }, null)).toEqual({});
  });
});
