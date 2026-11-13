import "dotenv/config";
import { expect, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);
test("usage shows empty activity and top-up controls", async ({
  page,
  context,
}) => {
  const session = await createTestSession("Usage Tester");
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/usage");
    await expect(
      page.getByRole("heading", { name: "Usage & credits" }),
    ).toBeVisible();
    await expect(page.getByText("No credit activity yet.")).toBeVisible();
    await page.getByRole("button", { name: "$50", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pay $50.00" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "30d" }).click();
    await expect(page).toHaveURL(/range=30d/);
    await expect(
      page.getByText("Credits spent over the last 30 days"),
    ).toBeVisible();
  } finally {
    await session.cleanup();
  }
});
