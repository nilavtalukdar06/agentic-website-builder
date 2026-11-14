import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import { fulfillCheckout } from "./fulfill";

const session = {
  id: "cs_test_1",
  mode: "payment",
  payment_status: "paid",
  currency: "usd",
  amount_total: 2500,
  client_reference_id: "user_1",
  metadata: { userId: "user_1", credits: "2500" },
} as unknown as Stripe.Checkout.Session;
function database() {
  const payment = {
    id: "payment_1",
    userId: "user_1",
    amountCents: 2500,
    status: "SUCCEEDED",
  };
  const tx = {
    payment: { upsert: vi.fn().mockResolvedValue(payment) },
    creditLedger: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const db = { $transaction: vi.fn((fn) => fn(tx)) } as unknown as PrismaClient;
  return { db, tx };
}
describe("checkout fulfillment", () => {
  it("uses stable unique keys for repeated deliveries", async () => {
    const { db, tx } = database();
    await fulfillCheckout(db, session);
    await fulfillCheckout(db, session);
    expect(tx.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerRef: "cs_test_1" },
        update: {},
      }),
    );
    expect(tx.creditLedger.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentId: "payment_1" },
        create: expect.objectContaining({ delta: 2500, userId: "user_1" }),
        update: {},
      }),
    );
  });
  it("waits long enough for a cold database connection", async () => {
    const { db } = database();
    await fulfillCheckout(db, session);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 15_000,
      timeout: 30_000,
    });
  });
  it.each([
    { payment_status: "unpaid" },
    { amount_total: 499 },
    { currency: "eur" },
    { client_reference_id: "other" },
    { metadata: { userId: "user_1", credits: "NaN" } },
  ])("rejects invalid checkout %o", async (invalid) => {
    const { db } = database();
    await expect(
      fulfillCheckout(db, {
        ...session,
        ...invalid,
      } as Stripe.Checkout.Session),
    ).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
