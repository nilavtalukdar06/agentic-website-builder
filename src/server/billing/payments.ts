import "server-only";
import Stripe from "stripe";
import { env } from "@/config/env";

export interface PaymentProvider {
  createCheckout(amountCents: number, userId: string): Promise<string>;
  verifyWebhook(body: string, signature: string): Stripe.Event;
}

export function stripeProvider(): PaymentProvider {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Payments are not configured");
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  return {
    async createCheckout(amountCents, userId) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        allowed_payment_method_types: ["card"],
        client_reference_id: userId,
        metadata: {
          userId,
          credits: String((amountCents / 100) * env.CREDITS_PER_USD),
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: { name: "Vibe credits" },
            },
            quantity: 1,
          },
        ],
        success_url: `${env.NEXT_PUBLIC_APP_URL}/usage?checkout=success`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/usage?checkout=cancelled`,
      });
      if (!session.url) throw new Error("Checkout URL unavailable");
      return session.url;
    },
    verifyWebhook(body, signature) {
      return stripe.webhooks.constructEvent(body, signature, webhookSecret);
    },
  };
}
