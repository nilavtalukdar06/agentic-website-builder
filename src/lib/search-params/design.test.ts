import { describe, expect, test } from "vitest";
import { designSearchParams, designSections } from "./design";

describe("design search params", () => {
  test("section accepts known sections only", () => {
    for (const section of designSections) {
      expect(designSearchParams.section.parse(section)).toBe(section);
    }
    expect(designSearchParams.section.parse("nope")).toBeNull();
  });

  test("theme accepts light, dark and system", () => {
    expect(designSearchParams.theme.parse("light")).toBe("light");
    expect(designSearchParams.theme.parse("system")).toBe("system");
    expect(designSearchParams.theme.parse("sepia")).toBeNull();
  });
});
