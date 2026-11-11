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

  test("the footer links to docs, status and contact", async ({ page }) => {
    await page.goto("/sign-in");
    const footer = page.getByRole("navigation", { name: "Footer" });
    await expect(footer.getByRole("link", { name: "Status" })).toHaveAttribute(
      "href",
      "/status",
    );
    await footer.getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL("/docs");
    await page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: "Contact" })
      .click();
    await expect(page).toHaveURL("/contact");
    await expect(
      page.getByRole("heading", { level: 1, name: "Contact" }),
    ).toBeVisible();
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

test.describe("docs", () => {
  test("index lists the articles and opens one", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("list").getByRole("link")).toHaveCount(6);
    await page.getByRole("link", { name: /Credits & billing/ }).click();
    await expect(page).toHaveURL("/docs/credits-and-billing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Credits & billing" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Docs", exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Export to GitHub" }).last().click();
    await expect(page).toHaveURL("/docs/export-to-github");
  });

  test("an unknown article shows the not-found state", async ({ page }) => {
    const response = await page.goto("/docs/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    await page.getByRole("link", { name: "Back to docs" }).click();
    await expect(page).toHaveURL("/docs");
  });
});

test.describe("contact", () => {
  test("links to every channel", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: /^Email/ })).toHaveAttribute(
      "href",
      "mailto:nilavtalukdar9@gmail.com",
    );
    await expect(
      page.getByRole("link", { name: /^Instagram/ }),
    ).toHaveAttribute("href", "https://www.instagram.com/nilav.talukdar");
    await expect(page.getByRole("link", { name: /^LinkedIn/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/nilav-talukdar",
    );
    await expect(page.getByRole("link", { name: /^GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/nilavtalukdar06",
    );
  });
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`contrast in ${theme}`, () => {
    for (const path of [
      "/sign-in",
      "/terms",
      "/privacy",
      "/docs",
      "/docs/getting-started",
      "/docs/export-to-github",
      "/contact",
    ]) {
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
