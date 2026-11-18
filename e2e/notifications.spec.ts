import "dotenv/config";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

type Session = Awaited<ReturnType<typeof createTestSession>>;
let session: Session;

test.beforeEach(async ({ context }) => {
  session = await createTestSession("Notify Tester");
  await context.addCookies([session.cookie]);
});
test.afterEach(async () => {
  await session.cleanup();
});

const ok = (json: unknown) => JSON.stringify([{ result: { data: { json } } }]);

async function openNotifications(page: Page) {
  const opener = page.getByRole("button", { name: "Open sidebar" });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Notifications" }).click();
  return page.getByRole("dialog", { name: "Notifications" });
}

test("says email isn't available when the server has no Resend key", async ({
  page,
}) => {
  test.skip(!!process.env.RESEND_API_KEY, "email is configured on this server");
  await page.goto("/");
  const dialog = await openNotifications(page);
  await expect(
    dialog.getByText("Email notifications aren’t available"),
  ).toBeVisible();
  await expect(dialog.getByRole("switch")).toHaveCount(0);
});

test("shows the address and the test-sender note, and keeps the switch in the database", async ({
  page,
}) => {
  await page.route("**/api/trpc/notifications.get**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: ok({
        configured: true,
        enabled: true,
        email: "owner@example.com",
        limited: true,
      }),
    });
  });
  await page.goto("/");
  const dialog = await openNotifications(page);
  await expect(dialog.getByText(/owner@example\.com/)).toBeVisible();
  await expect(dialog.getByText(/free test sender/)).toBeVisible();

  expect(await session.notifyEmail()).toBe(true);
  await dialog
    .getByRole("switch", { name: "Email me about my builds" })
    .click();
  await expect.poll(() => session.notifyEmail()).toBe(false);
});

test("shows an error with retry", async ({ page }) => {
  let failing = true;
  await page.route("**/api/trpc/notifications.get**", async (route) => {
    await route.fulfill(
      failing
        ? {
            status: 500,
            contentType: "application/json",
            body: JSON.stringify([
              {
                error: {
                  json: {
                    message: "boom",
                    code: -32603,
                    data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                  },
                },
              },
            ]),
          }
        : {
            status: 200,
            contentType: "application/json",
            body: ok({
              configured: true,
              enabled: false,
              email: null,
              limited: false,
            }),
          },
    );
  });
  await page.goto("/");
  const dialog = await openNotifications(page);
  await expect(
    dialog.getByText("Couldn’t load your notifications"),
  ).toBeVisible({ timeout: 15_000 });
  failing = false;
  await dialog.getByRole("button", { name: /try again/i }).click();
  await expect(
    dialog.getByRole("switch", { name: "Email me about my builds" }),
  ).not.toBeChecked();
});

test("the dialog fits a 320 px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route("**/api/trpc/notifications.get**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: ok({
        configured: true,
        enabled: true,
        email:
          "a-very-long-address-that-has-to-wrap@example-company-domain.com",
        limited: true,
      }),
    });
  });
  await page.goto("/");
  const dialog = await openNotifications(page);
  await expect(dialog.getByText(/a-very-long-address/)).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
