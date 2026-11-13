import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";

export async function fulfillCheckout(
  db: PrismaClient,
  session: Stripe.Checkout.Session,
) {
  const userId = session.metadata?.userId;
  const credits = Number(session.metadata?.credits);
  const amount = session.amount_total;
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    !userId ||
    session.client_reference_id !== userId ||
    !Number.isSafeInteger(credits) ||
    credits <= 0 ||
    !amount ||
    amount < 500 ||
    amount > 10000 ||
    amount % 100 !== 0
  ) {
    throw new Error("Invalid paid checkout session");
  }
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.upsert({
      where: { providerRef: session.id },
      create: {
        userId,
        provider: "stripe",
        providerRef: session.id,
        amountCents: amount,
        currency: "usd",
        status: "SUCCEEDED",
      },
      update: {},
    });
    if (
      payment.userId !== userId ||
      payment.amountCents !== amount ||
      payment.status !== "SUCCEEDED"
    )
      throw new Error("Payment does not match checkout");
    await tx.creditLedger.upsert({
      where: { paymentId: payment.id },
      create: {
        userId,
        delta: credits,
        reason: "TOPUP",
        paymentId: payment.id,
        meta: { amountCents: amount, currency: "usd" },
      },
      update: {},
    });
  });
}
