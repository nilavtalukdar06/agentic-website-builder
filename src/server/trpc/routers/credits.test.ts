import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TRPCContext } from "../init";
import { createCallerFactory } from "../init";
const createCheckout = vi.hoisted(() =>
  vi.fn().mockResolvedValue("https://checkout.stripe.com/test"),
);
vi.mock("server-only", () => ({}));
vi.mock("@/server/billing/payments", () => ({
  stripeProvider: () => ({ createCheckout }),
}));
import { creditsRouter } from "./credits";
const caller = createCallerFactory(creditsRouter);
const upsert = vi.hoisted(() => vi.fn());
const db = { throttleWindow: { upsert } };
const signedIn = caller({
  session: { user: { id: "user_1" } },
  db,
} as unknown as TRPCContext);
beforeEach(() => {
  upsert.mockReset().mockResolvedValue({ count: 1 });
  createCheckout.mockClear();
});
describe("checkout", () => {
  it.each([0, 4, 101, 5.5, -1])("rejects amount %s", async (amount) => {
    await expect(signedIn.checkout({ amount })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("uses the authenticated user and converts whole dollars to cents", async () => {
    await expect(signedIn.checkout({ amount: 25 })).resolves.toEqual({
      url: "https://checkout.stripe.com/test",
    });
    expect(createCheckout).toHaveBeenCalledWith(2500, "user_1");
  });
  it("is rate limited per user", async () => {
    upsert.mockResolvedValue({ count: 11 });
    await expect(signedIn.checkout({ amount: 5 })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(createCheckout).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0][0].where.key_windowStart.key).toBe(
      "checkout:user_1",
    );
  });
  it("requires a session", async () => {
    await expect(
      caller({ session: null, db: {} } as TRPCContext).checkout({ amount: 5 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
