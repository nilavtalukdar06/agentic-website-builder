import { describe, expect, test, vi } from "vitest";
import {
  describeAnswer,
  findPriorAnswer,
  loadApprovals,
  questionHash,
} from "./requests";

const text = { kind: "text" as const, question: "What is the cafe called?" };

describe("input requests", () => {
  test("hashes questions by meaning, and secrets by name", () => {
    expect(questionHash(text)).toBe(
      questionHash({ ...text, question: "  what is the CAFE   called? " }),
    );
    expect(
      questionHash({ kind: "secret", name: "A_KEY", label: "x", reason: "y" }),
    ).toBe(
      questionHash({ kind: "secret", name: "A_KEY", label: "z", reason: "w" }),
    );
  });

  test("describes answers without secret values", () => {
    const secret = {
      kind: "secret" as const,
      name: "GOOGLE_GENERATIVE_AI_API_KEY",
      label: "Gemini key",
      reason: "AI chat",
    };
    const described = describeAnswer(secret, { ok: true, answer: "set" });
    expect(described).toContain(
      '{"name":"GOOGLE_GENERATIVE_AI_API_KEY","status":"set"}',
    );
    expect(describeAnswer(text, { ok: false })).toMatch(/dismissed/);
    expect(
      describeAnswer(
        { kind: "confirm", action: "Install x", risk: "medium", summary: "s" },
        { ok: true, answer: "declined" },
      ),
    ).toMatch(/^The user declined: Install x/);
  });

  test("reuses a stored secret or an earlier answer", async () => {
    const db = {
      projectSecret: { count: vi.fn().mockResolvedValue(1) },
      inputRequest: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ answer: { ok: true, answer: "Ember" } }),
      },
    };
    await expect(
      findPriorAnswer(db as never, {
        projectId: "p1",
        payload: { kind: "secret", name: "A_KEY", label: "x", reason: "y" },
        excludeId: "i1",
      }),
    ).resolves.toEqual({ ok: true, answer: "set" });
    await expect(
      findPriorAnswer(db as never, {
        projectId: "p1",
        payload: text,
        excludeId: "i1",
      }),
    ).resolves.toEqual({ ok: true, answer: "Ember" });
    await expect(
      findPriorAnswer(db as never, {
        projectId: "p1",
        payload: { kind: "confirm", action: "a", risk: "low", summary: "s" },
        excludeId: "i1",
      }),
    ).resolves.toBeNull();
  });

  test("collects approved packages and actions", async () => {
    const db = {
      inputRequest: {
        findMany: vi.fn().mockResolvedValue([
          {
            payload: {
              request: {
                kind: "confirm",
                action: "Install x",
                risk: "medium",
                summary: "s",
              },
              packages: ["x"],
            },
            answer: { ok: true, answer: "approved" },
          },
          {
            payload: {
              request: {
                kind: "confirm",
                action: "Install y",
                risk: "medium",
                summary: "s",
              },
              packages: ["y"],
            },
            answer: { ok: true, answer: "declined" },
          },
        ]),
      },
    };
    await expect(loadApprovals(db as never, "p1")).resolves.toEqual({
      packages: ["x"],
      actions: ["Install x"],
    });
  });
});
