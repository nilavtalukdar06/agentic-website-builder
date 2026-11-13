// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { claimPrompt, isStopRequested } from "./prompt-state";

describe("claimPrompt", () => {
  test("claims a prompt nobody stopped", async () => {
    const db = {
      message: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    await expect(claimPrompt(db as never, "m1")).resolves.toBe(true);
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", stopRequestedAt: null },
      data: { startedAt: expect.any(Date) },
    });
  });

  test("refuses a prompt stopped before it started", async () => {
    const db = {
      message: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    await expect(claimPrompt(db as never, "m1")).resolves.toBe(false);
  });
});

describe("isStopRequested", () => {
  test("reads the stop flag", async () => {
    const db = {
      message: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ stopRequestedAt: new Date() })
          .mockResolvedValueOnce({ stopRequestedAt: null }),
      },
    };
    await expect(isStopRequested(db as never, "m1")).resolves.toBe(true);
    await expect(isStopRequested(db as never, "m1")).resolves.toBe(false);
  });
});
