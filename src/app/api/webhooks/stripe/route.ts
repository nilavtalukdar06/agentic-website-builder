import { fulfillCheckout } from "@/server/billing/fulfill";
import { stripeProvider } from "@/server/billing/payments";
import { db } from "@/server/db";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event;
  try {
    event = stripeProvider().verifyWebhook(await request.text(), signature);
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (event.data.object.payment_status === "paid")
      await fulfillCheckout(db, event.data.object);
  }
  return new Response("OK");
}
