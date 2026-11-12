// @vitest-environment node
import { describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const base = { projectId: "p1", name: "OPENAI_API_KEY" };

describe("secret encryption", () => {
  test("round-trips a value with a fresh IV each time", () => {
    const a = encryptSecret({ ...base, value: "sk-test-value" });
    const b = encryptSecret({ ...base, value: "sk-test-value" });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toContain("sk-test-value");
    expect(a.keyVersion).toBe(1);
    expect(decryptSecret({ ...base, ...a })).toBe("sk-test-value");
  });

  test("binds the ciphertext to its project and name", () => {
    const sealed = encryptSecret({ ...base, value: "sk-test-value" });
    expect(() =>
      decryptSecret({ ...base, projectId: "p2", ...sealed }),
    ).toThrow();
    expect(() =>
      decryptSecret({ ...base, ...sealed, name: "ANTHROPIC_API_KEY" }),
    ).toThrow();
  });

  test("rejects a tampered tag or ciphertext", () => {
    const sealed = encryptSecret({ ...base, value: "sk-test-value" });
    const flipped = Buffer.from(sealed.tag, "base64");
    flipped[0] ^= 1;
    expect(() =>
      decryptSecret({ ...base, ...sealed, tag: flipped.toString("base64") }),
    ).toThrow();
    const body = Buffer.from(sealed.ciphertext, "base64");
    body[0] ^= 1;
    expect(() =>
      decryptSecret({
        ...base,
        ...sealed,
        ciphertext: body.toString("base64"),
      }),
    ).toThrow();
  });

  test("refuses an unknown key version", () => {
    const sealed = encryptSecret({ ...base, value: "x" });
    expect(() => decryptSecret({ ...base, ...sealed, keyVersion: 9 })).toThrow(
      /key version 9/,
    );
  });
});
