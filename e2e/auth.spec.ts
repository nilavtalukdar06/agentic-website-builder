import "dotenv/config";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.describe("signed out", () => {
  for (const path of ["/", "/projects", "/usage", "/p/demo"]) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(
        `/sign-in?callbackURL=${encodeURIComponent(path)}`,
      );
    });
  }

  test("sign-in page matches the canvas copy", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to Vibe" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Describe a website, watch it get built, export it to GitHub.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/We only read your GitHub profile and email/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Privacy Policy" }),
    ).toBeVisible();
  });

  test("sign-in shows the gradient showcase on wide screens only", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    const showcase = page.locator("[data-slot='sign-in-showcase']");
    await expect(showcase).toBeVisible();
    await expect(showcase.locator("[data-slot='aurora']")).toBeAttached();
    await expect(
      showcase.getByRole("status", { name: "Example prompt" }),
    ).toContainText(/Ask Vibe/, { timeout: 10_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(showcase).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeVisible();
  });

  test("shows the OAuth error from the callback", async ({ page }) => {
    await page.goto("/sign-in?error=access_denied");
    await expect(page.getByText(/access_denied/)).toBeVisible();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`sign-in shows only the ${theme} app icon`, async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("vibe-theme", value),
        theme,
      );
      await page.goto("/sign-in");
      await expect(
        page.locator("main [data-slot='app-icon']:visible"),
      ).toHaveCount(1);
      await expect(
        page.locator(`main [data-slot='app-icon'][data-variant='${theme}']`),
      ).toBeVisible();
    });

    test(`sign-in has no contrast violations in ${theme}`, async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("vibe-theme", value),
        theme,
      );
      await page.goto("/sign-in");
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

  test("Continue with GitHub asks only for profile and email", async ({
    page,
  }) => {
    await page.route("https://github.com/**", (route) =>
      route.fulfill({ status: 200, body: "github" }),
    );
    await page.goto("/sign-in?callbackURL=%2Fprojects");
    const authorize = page.waitForRequest((request) =>
      request.url().startsWith("https://github.com/login/oauth/authorize"),
    );
    await page.getByRole("button", { name: "Continue with GitHub" }).click();
    const url = new URL((await authorize).url());
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "read:user",
      "user:email",
    ]);
    expect(url.searchParams.get("client_id")).toBe(
      process.env.GITHUB_CLIENT_ID,
    );
  });
});

test.describe("signed in", () => {
  test.skip(
    !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
    "needs the database and auth env",
  );

  test("shell shows the user and sign out returns to sign-in", async ({
    page,
    context,
  }) => {
    const session = await createTestSession("E2E Tester");
    try {
      await context.addCookies([session.cookie]);
      await page.goto("/");
      await expect(page.getByText("E2E Tester")).toBeVisible();

      await page.goto("/sign-in");
      await expect(page).toHaveURL("/");

      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
      await page.goto("/");
      await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2F$/);
    } finally {
      await session.cleanup();
    }
  });
});
