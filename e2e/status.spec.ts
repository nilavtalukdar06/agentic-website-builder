import "dotenv/config";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.skip(!process.env.DATABASE_URL, "needs the database");

test("shows the banner, stats and 24 hourly bars", async ({ page }) => {
  await page.goto("/status");
  await expect(
    page.getByRole("heading", { level: 1, name: "Status" }),
  ).toBeVisible();
  await expect(page.getByText("All systems operational")).toBeVisible();
  await expect(
    page.getByText("Average response", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-slot='uptime-bar']")).toHaveCount(24);
  await expect(
    page.locator("[data-slot='uptime-bar'][data-state='operational']").first(),
  ).toBeVisible();
  await expect(
    page.locator("[data-slot='uptime-bar'][data-state='outage']").first(),
  ).toBeAttached();
});

test("the range tabs switch the number of bars and update the URL", async ({
  page,
}) => {
  await page.goto("/status");
  await page.getByRole("tab", { name: "3 days" }).click();
  await expect(page).toHaveURL(/range=72h/);
  await expect(page.locator("[data-slot='uptime-bar']")).toHaveCount(72);

  await page.getByRole("tab", { name: "7 days" }).click();
  await expect(page).toHaveURL(/range=7d/);
  await expect(page.locator("[data-slot='uptime-bar']")).toHaveCount(168);
  await expect(
    page.locator("[data-slot='uptime-bar'][data-state='no-data']").first(),
  ).toBeAttached();

  await page.goto("/status?range=72h");
  await expect(page.locator("[data-slot='uptime-bar']")).toHaveCount(72);
});

test("hovering a bar shows the hour and its uptime", async ({ page }) => {
  await page.goto("/status");
  await page
    .locator("[data-slot='uptime-bar'][data-state='operational']")
    .last()
    .locator("[data-slot='tooltip-trigger']")
    .hover();
  await expect(page.locator("[data-slot='tooltip-content']")).toContainText(
    /UTC/,
  );
  await expect(page.locator("[data-slot='tooltip-content']")).toContainText(
    /uptime/,
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`status has no contrast violations in ${theme}`, async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("vibe-theme", value),
      theme,
    );
    await page.goto("/status");
    await expect(page.getByText("All systems operational")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(
      theme === "light" ? /theme-light/ : /(^|\s)dark(\s|$)/,
    );
    const results = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    expect(
      results.violations.flatMap((violation) =>
        violation.nodes.map((node) => node.target.join(" ")),
      ),
    ).toEqual([]);
  });
}
