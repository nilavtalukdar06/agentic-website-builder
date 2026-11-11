import { expect, test } from "@playwright/test";

test("home requires sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2F$/);
});
