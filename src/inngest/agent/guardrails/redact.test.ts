import { describe, expect, test } from "vitest";
import { createRedactor } from "./redact";

const value = "sk-live-Abc123+/=Zz9";
const redactor = createRedactor([{ name: "OPENAI_API_KEY", value }]);

describe("createRedactor", () => {
  test("replaces the exact, base64 and URL-encoded forms", () => {
    const base64 = Buffer.from(value).toString("base64");
    const text = `a ${value} b ${base64} c ${encodeURIComponent(value)} d ${base64.replace(/=+$/, "")}`;
    const out = redactor.redact(text);
    expect(out).not.toContain(value);
    expect(out).not.toContain(base64.replace(/=+$/, ""));
    expect(out).not.toContain(encodeURIComponent(value));
    expect(out.match(/\[secret OPENAI_API_KEY\]/g)).toHaveLength(4);
  });

  test("redacts deep JSON values and reports which secret a text holds", () => {
    expect(
      redactor.redactDeep({ a: [`x${value}`], b: { c: 1, d: value } }),
    ).toEqual({
      a: ["x[secret OPENAI_API_KEY]"],
      b: { c: 1, d: "[secret OPENAI_API_KEY]" },
    });
    expect(redactor.contains(`const k = "${value}"`)).toBe("OPENAI_API_KEY");
    expect(redactor.contains("nothing here")).toBeNull();
  });

  test("ignores values too short to match safely", () => {
    const tiny = createRedactor([{ name: "PIN", value: "123" }]);
    expect(tiny.active).toBe(false);
    expect(tiny.redact("123")).toBe("123");
  });

  test("reports the longest form to hold back while streaming", () => {
    expect(redactor.maxNeedleLength).toBeGreaterThanOrEqual(
      encodeURIComponent(value).length,
    );
  });
});
