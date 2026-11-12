import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("sign-in links", () => {
  test("Terms and Privacy Policy open their pages", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL("/terms");
    await expect(
      page.getByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeVisible();

    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL("/privacy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
  });

  test("the footer shows only the contact email", async ({ page }) => {
    await page.goto("/sign-in");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link")).toHaveCount(1);
    await expect(
      footer.getByRole("link", { name: "nilavtalukdar9@gmail.com" }),
    ).toHaveAttribute("href", "mailto:nilavtalukdar9@gmail.com");
  });

  test("docs, status and contact no longer exist", async ({ page }) => {
    for (const path of ["/docs", "/status", "/contact"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });
});

test.describe("legal pages", () => {
  test("terms and privacy show the date and the on-this-page list", async ({
    page,
  }) => {
    for (const path of ["/terms", "/privacy"]) {
      await page.goto(path);
      await expect(page.getByText(/Last updated/)).toBeVisible();
      await expect(page.locator("main h2").first()).toBeVisible();
    }
    await page.goto("/terms");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: "6. Credits and payments" })
      .click();
    await expect(page).toHaveURL("/terms#credits");
  });
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`contrast in ${theme}`, () => {
    for (const path of ["/sign-in", "/terms", "/privacy"]) {
      test(`${path} has no contrast violations`, async ({ page }) => {
        await page.addInitScript(
          (value) => localStorage.setItem("vibe-theme", value),
          theme,
        );
        await page.goto(path);
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
  });
}
