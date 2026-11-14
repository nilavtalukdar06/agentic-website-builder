import { fulfillCheckout } from "@/server/billing/fulfill";
import { stripeProvider } from "@/server/billing/payments";
import { db } from "@/server/db";
import { raiseAlert } from "@/server/ops/alert";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event;
  try {
    event = stripeProvider().verifyWebhook(await request.text(), signature);
  } catch {
    console.warn("[stripe] rejected a webhook with an invalid signature");
    return new Response("Invalid webhook", { status: 400 });
  }
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (event.data.object.payment_status === "paid") {
      try {
        await fulfillCheckout(db, event.data.object);
      } catch (error) {
        await raiseAlert({
          kind: "stripe-webhook",
          message:
            "A paid checkout couldn't be credited. Stripe will retry the event.",
          details: {
            eventId: event.id,
            eventType: event.type,
            session: event.data.object.id,
            error: error instanceof Error ? error.message : "unknown",
          },
        });
        return new Response("Fulfillment failed", { status: 500 });
      }
    }
  }
  return new Response("OK");
}
