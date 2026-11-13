import { describe, expect, test } from "vitest";
import { patternRedactor } from "./redact";

const key = `sk-proj-${"A1b2C3d4".repeat(5)}`;

describe("patternRedactor", () => {
  test("replaces keys that match a known pattern", () => {
    expect(patternRedactor.redact(`use ${key} here`)).toBe(
      "use [secret removed] here",
    );
  });

  test("redacts deep JSON values", () => {
    expect(
      patternRedactor.redactDeep({ a: [`x ${key}`], b: { c: 1, d: key } }),
    ).toEqual({
      a: ["x [secret removed]"],
      b: { c: 1, d: "[secret removed]" },
    });
  });

  test("leaves placeholders and ordinary text alone", () => {
    const text = "postgres://user:password@localhost:5432/db and sk-short";
    expect(patternRedactor.redact(text)).toBe(text);
  });
});
