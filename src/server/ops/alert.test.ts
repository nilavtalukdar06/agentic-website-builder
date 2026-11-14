// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const config = vi.hoisted(() => ({
  env: { ALERT_WEBHOOK_URL: undefined as string | undefined },
}));
vi.mock("@/config/env", () => config);

const { formatAlert, raiseAlert } = await import("./alert");

const alert = {
  kind: "stripe-webhook",
  message: "A paid checkout couldn't be credited.",
  details: { eventId: "evt_1", attempts: 3 },
};

beforeEach(() => {
  config.env.ALERT_WEBHOOK_URL = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("formatAlert", () => {
  test("names the kind and lists the details", () => {
    expect(formatAlert(alert)).toBe(
      "Vibe alert (stripe-webhook): A paid checkout couldn't be credited. [eventId=evt_1 attempts=3]",
    );
    expect(formatAlert({ kind: "x", message: "y" })).toBe("Vibe alert (x): y");
  });
});

describe("raiseAlert", () => {
  test("only logs when no webhook is configured", async () => {
    const send = vi.fn();
    await expect(raiseAlert(alert, send)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[alert] Vibe alert (stripe-webhook)"),
    );
  });

  test("posts Slack- and Discord-compatible JSON to the webhook", async () => {
    config.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/abc";
    const send = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(raiseAlert(alert, send)).resolves.toBe(true);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/abc");
    const body = JSON.parse(init.body);
    expect(body.text).toBe(body.content);
    expect(body.text).toContain("evt_1");
  });

  test("never throws or leaks the webhook URL when delivery fails", async () => {
    config.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/secret-token";
    const send = vi
      .fn()
      .mockRejectedValue(
        new Error("fetch failed https://hooks.example.com/secret-token"),
      );
    await expect(raiseAlert(alert, send)).resolves.toBe(false);
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain("secret-token");
  });

  test("reports a rejected status as undelivered", async () => {
    config.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/abc";
    const send = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(raiseAlert(alert, send)).resolves.toBe(false);
  });
});
