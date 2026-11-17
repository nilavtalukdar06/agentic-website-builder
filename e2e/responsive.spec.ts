import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

const widths = [320, 375, 768] as const;

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const width of widths) {
  test.describe(`public pages at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const path of ["/sign-in", "/terms", "/privacy", "/design"]) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoHorizontalScroll(page);
      });
    }
  });
}

test.describe("signed-in pages on a phone", () => {
  test.skip(
    !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
    "needs the database and auth env",
  );

  for (const width of [320, 375] as const) {
    test(`home, projects and usage fit ${width}px`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      const session = await createTestSession("Responsive Tester");
      try {
        await context.addCookies([session.cookie]);

        await page.goto("/");
        await expect(
          page.getByRole("heading", { name: "What should we build today?" }),
        ).toBeVisible();
        await expect(page.getByText("My projects")).toBeInViewport({
          ratio: 1,
        });
        await expect(
          page.getByRole("link", { name: "Browse all" }),
        ).toBeVisible();
        await expectNoHorizontalScroll(page);

        await page.goto("/projects");
        await expect(
          page.getByRole("heading", { name: "Projects" }),
        ).toBeVisible();
        await expectNoHorizontalScroll(page);

        await page.goto("/usage");
        await expect(
          page.getByRole("heading", { name: "Usage & credits" }),
        ).toBeVisible();
        await expectNoHorizontalScroll(page);
      } finally {
        await session.cleanup();
      }
    });
  }

  test("the sidebar opens as a sheet and hides the keyboard hint", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const session = await createTestSession("Sidebar Tester");
    try {
      await context.addCookies([session.cookie]);
      await page.goto("/projects");
      await page.getByRole("button", { name: "Open sidebar" }).click();
      await expect(
        page.getByRole("button", { name: "New project" }).first(),
      ).toBeVisible();
      await expect(page.getByText("⌘K")).toBeHidden();
    } finally {
      await session.cleanup();
    }
  });
});
