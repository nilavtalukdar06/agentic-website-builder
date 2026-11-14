import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

type Session = Awaited<ReturnType<typeof createTestSession>>;

const stripeTestMode =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.STRIPE_WEBHOOK_SECRET;

let session: Session;

test.beforeEach(async ({ context }) => {
  session = await createTestSession("E2E Billing");
  await context.addCookies([session.cookie]);
});

test.afterEach(async () => {
  await session.cleanup();
});

function checkoutEvent(
  userId: string,
  overrides: Partial<Stripe.Checkout.Session> = {},
) {
  const sessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        currency: "usd",
        amount_total: 2500,
        client_reference_id: userId,
        metadata: { userId, credits: "2500" },
        ...overrides,
      },
    },
  });
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, header, sessionId };
}

async function deliver(
  request: import("@playwright/test").APIRequestContext,
  event: { payload: string; header: string },
) {
  return request.post("/api/webhooks/stripe", {
    data: event.payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": event.header,
    },
  });
}

test.describe("top-up in Stripe test mode", () => {
  test.skip(!stripeTestMode, "needs Stripe test-mode keys");

  test("Pay opens a hosted Stripe Checkout page", async ({ page }) => {
    await page.goto("/usage");
    await page.getByRole("button", { name: "$25", exact: true }).click();
    await page.getByRole("button", { name: "Pay $25.00" }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    expect(page.url()).toContain("checkout.stripe.com");
  });

  test("a signed paid event credits the balance once, even when delivered twice", async ({
    page,
    request,
  }) => {
    expect(await session.creditBalance()).toBe(0);
    const event = checkoutEvent(session.userId);
    expect((await deliver(request, event)).status()).toBe(200);
    expect((await deliver(request, event)).status()).toBe(200);
    expect(await session.creditBalance()).toBe(2500);
    expect(await session.paymentCount()).toBe(1);

    await page.goto("/usage");
    await expect(page.getByText("Top-up").first()).toBeVisible();
    await expect(page.getByText("2,500").first()).toBeVisible();
  });

  test("an unsigned or tampered event is refused and credits nothing", async ({
    request,
  }) => {
    const event = checkoutEvent(session.userId);
    const missing = await request.post("/api/webhooks/stripe", {
      data: event.payload,
      headers: { "content-type": "application/json" },
    });
    expect(missing.status()).toBe(400);
    const tampered = await deliver(request, {
      payload: event.payload.replace("2500", "999999"),
      header: event.header,
    });
    expect(tampered.status()).toBe(400);
    expect(await session.creditBalance()).toBe(0);
  });

  test("a paid event that doesn't match the account answers 500 so Stripe retries, and credits nothing", async ({
    request,
  }) => {
    const event = checkoutEvent(session.userId, {
      client_reference_id: "someone-else",
    });
    expect((await deliver(request, event)).status()).toBe(500);
    expect(await session.creditBalance()).toBe(0);
  });

  test("an unpaid session credits nothing", async ({ request }) => {
    const event = checkoutEvent(session.userId, {
      payment_status: "unpaid",
    });
    expect((await deliver(request, event)).status()).toBe(200);
    expect(await session.creditBalance()).toBe(0);
  });
});

test("checkout is limited per user", async ({ page }) => {
  test.skip(!stripeTestMode, "needs Stripe test-mode keys");
  await session.exhaustRateLimit("checkout", 60 * 60_000);
  await page.goto("/usage");
  await page.getByRole("button", { name: "$5", exact: true }).click();
  await page.getByRole("button", { name: "Pay $5.00" }).click();
  await expect(page.getByText(/too often|too quickly/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/usage/);
});
