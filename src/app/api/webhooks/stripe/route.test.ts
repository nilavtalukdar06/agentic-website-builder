import { beforeEach, describe, expect, it, vi } from "vitest";
const { verifyWebhook, fulfillCheckout } = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  fulfillCheckout: vi.fn(),
}));
vi.mock("@/server/billing/payments", () => ({
  stripeProvider: () => ({ verifyWebhook }),
}));
vi.mock("@/server/billing/fulfill", () => ({ fulfillCheckout }));
vi.mock("@/server/db", () => ({ db: {} }));
import { POST } from "./route";
const request = (signature?: string) =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: "payload",
  });
describe("Stripe webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("rejects absent or invalid signatures", async () => {
    expect((await POST(request())).status).toBe(400);
    verifyWebhook.mockImplementation(() => {
      throw new Error("bad signature");
    });
    expect((await POST(request("invalid"))).status).toBe(400);
    expect(fulfillCheckout).not.toHaveBeenCalled();
  });
  it("fulfills paid sessions and ignores unpaid sessions", async () => {
    verifyWebhook.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "unpaid" } },
    });
    expect((await POST(request("valid"))).status).toBe(200);
    expect(fulfillCheckout).not.toHaveBeenCalled();
    const session = { payment_status: "paid" };
    verifyWebhook.mockReturnValue({
      type: "checkout.session.async_payment_succeeded",
      data: { object: session },
    });
    expect((await POST(request("valid"))).status).toBe(200);
    expect(fulfillCheckout).toHaveBeenCalledWith({}, session);
  });
});
