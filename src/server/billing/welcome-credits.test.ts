import { describe, expect, test, vi } from "vitest";
import { grantWelcomeCredits } from "./welcome-credits";

function makeDb() {
  return {
    creditLedger: { create: vi.fn().mockResolvedValue({ id: "l1" }) },
  };
}

describe("grantWelcomeCredits", () => {
  test("writes nothing when the amount is 0", async () => {
    const db = makeDb();
    await expect(grantWelcomeCredits(db as never, "u1", 0)).resolves.toBeNull();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  test("writes one welcome entry for a positive amount", async () => {
    const db = makeDb();
    await grantWelcomeCredits(db as never, "u1", 100);
    expect(db.creditLedger.create).toHaveBeenCalledOnce();
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        delta: 100,
        reason: "ADJUSTMENT",
        meta: { kind: "welcome" },
      },
    });
  });
});
