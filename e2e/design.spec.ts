import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const sections = [
  "Brand",
  "Color",
  "Typography",
  "Radius & states",
  "Components",
  "AI Elements",
  "Patterns",
];

test.describe("/design", () => {
  test("renders every section", async ({ page }) => {
    await page.goto("/design");
    await expect(
      page.getByRole("heading", { level: 1, name: "Vibe" }),
    ).toBeVisible();
    for (const name of sections) {
      await expect(
        page.getByRole("heading", { level: 2, name, exact: true }),
      ).toBeVisible();
    }
  });

  test("?theme= forces the theme", async ({ page }) => {
    await page.goto("/design?theme=light");
    await expect(page.locator("html")).toHaveClass(/theme-light/);
    await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await page.goto("/design?theme=dark");
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("the theme toggle writes ?theme=", async ({ page }) => {
    await page.goto("/design?theme=dark");
    await page
      .getByRole("navigation", { name: "Design system sections" })
      .getByRole("button", { name: "Toggle theme" })
      .click();
    await expect(page).toHaveURL(/theme=light/);
    await expect(page.locator("html")).toHaveClass(/theme-light/);
  });

  test("?section= scrolls to the section", async ({ page }) => {
    await page.goto("/design?section=patterns");
    await expect(page.locator("#patterns")).toBeInViewport();
  });

  test("section links update ?section=", async ({ page }) => {
    await page.goto("/design");
    await page
      .getByRole("navigation", { name: "Design system sections" })
      .getByRole("link", { name: "Color" })
      .click();
    await expect(page).toHaveURL(/section=color/);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no contrast violations in ${theme}`, async ({ page }) => {
      await page.goto(`/design?theme=${theme}`);
      await expect(page.locator("html")).toHaveClass(
        theme === "light" ? /theme-light/ : /(^|\s)dark(\s|$)/,
      );
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withRules(["color-contrast"])
        .exclude("[data-slot='generating-overlay'] ul[aria-hidden]")
        .analyze();
      expect(
        results.violations.flatMap((violation) =>
          violation.nodes.map((node) => node.target.join(" ")),
        ),
      ).toEqual([]);
    });
  }
});

test.describe("brand assets", () => {
  for (const path of [
    "/icon.svg",
    "/apple-icon",
    "/opengraph-image",
    "/manifest.webmanifest",
    "/robots.txt",
  ]) {
    test(`${path} is served`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
    });
  }
});

test.describe("metadata", () => {
  test("root layout publishes title, description and social cards", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Vibe — AI website builder");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /live sandbox/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/opengraph-image/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test("/design is not indexed", async ({ page }) => {
    await page.goto("/design");
    await expect(page).toHaveTitle("Design system · Vibe");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
