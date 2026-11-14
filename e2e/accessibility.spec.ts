import "dotenv/config";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

type Session = Awaited<ReturnType<typeof createTestSession>>;

const previewHost = `localhost:${process.env.E2E_PORT ?? 3000}`;

let session: Session;
let slug: string;

async function stubWake(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    if (!route.request().url().includes("sandbox.wake"))
      return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: {
            data: {
              json: {
                status: "ready",
                previewUrl: `http://${previewHost}/terms`,
              },
            },
          },
        },
      ]),
    });
  });
}

test.beforeEach(async ({ context }) => {
  session = await createTestSession("E2E Access");
  slug = `a11y-${randomUUID().slice(0, 8)}`;
  const projectId = await session.addProject({ slug, name: "Access site" });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Build an accessible site",
    startedAt: new Date(Date.now() - 60_000),
    createdAt: new Date(Date.now() - 60_000),
  });
  await session.addMessage({
    id: `run_a11y${slug}_reply`,
    projectId,
    role: "ASSISTANT",
    replyToId: prompt,
    content: "Built it.",
    parts: [{ type: "text", text: "Built it." }],
    createdAt: new Date(Date.now() - 40_000),
  });
  await session.addVersion({
    projectId,
    number: 1,
    title: "First version",
    runId: `a11y${slug}`,
    creditCost: 3,
    files: {
      "app/page.tsx": "export default function Page() {\n  return null;\n}\n",
      "components/footer.tsx":
        "export function Footer() {\n  return null;\n}\n",
    },
    createdAt: new Date(Date.now() - 40_000),
  });
  await context.addCookies([session.cookie]);
});

test.afterEach(async () => {
  await session.cleanup();
});

const screens = [
  { name: "home", path: () => "/", ready: "What should we build today?" },
  { name: "projects", path: () => "/projects", ready: "Projects" },
  { name: "usage", path: () => "/usage", ready: "Usage & credits" },
  {
    name: "workspace preview",
    path: () => `/p/${slug}`,
    ready: "Built it.",
  },
  {
    name: "workspace code",
    path: () => `/p/${slug}?view=code`,
    ready: "Built it.",
  },
] as const;

for (const theme of ["light", "dark"] as const) {
  test.describe(`axe in ${theme}`, () => {
    for (const screen of screens) {
      test(`${screen.name} has no WCAG A/AA violations`, async ({ page }) => {
        await stubWake(page);
        await page.addInitScript(
          (value) => localStorage.setItem("vibe-theme", value),
          theme,
        );
        await page.goto(screen.path());
        await expect(page.getByText(screen.ready).first()).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.locator("html")).toHaveClass(
          theme === "light" ? /theme-light/ : /(^|\s)dark(\s|$)/,
        );
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .exclude("iframe")
          .analyze();
        expect(
          results.violations.map((violation) => ({
            rule: violation.id,
            nodes: violation.nodes.map((node) => node.target.join(" ")),
          })),
        ).toEqual([]);
      });
    }
  });
}

async function showsFocusIndicator(page: Page) {
  return page.evaluate(() => {
    let node = document.activeElement as HTMLElement | null;
    for (let depth = 0; node && depth < 4; depth++) {
      const style = getComputedStyle(node);
      const outline =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const shadow = style.boxShadow !== "none";
      if (outline || shadow) return true;
      node = node.parentElement;
    }
    return false;
  });
}

test.describe("keyboard", () => {
  test("the home prompt is reachable with Tab and shows a focus ring", async ({
    page,
  }) => {
    await page.goto("/");
    const textbox = page.getByRole("textbox", {
      name: "Describe the website to build",
    });
    await expect(textbox).toBeVisible();
    let reached = false;
    for (let presses = 0; presses < 40 && !reached; presses++) {
      await page.keyboard.press("Tab");
      reached = await textbox.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
    expect(await showsFocusIndicator(page)).toBe(true);
    await page.keyboard.type("A site for a bakery");
    await expect(textbox).toHaveValue("A site for a bakery");
  });

  test("every control reached with Tab in the workspace shows a focus ring", async ({
    page,
  }) => {
    await stubWake(page);
    await page.goto(`/p/${slug}`);
    await expect(page.getByText("Built it.")).toBeVisible();
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    const missing: string[] = [];
    for (let presses = 0; presses < 25; presses++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        return (
          el.getAttribute("aria-label") ||
          el.textContent?.trim().slice(0, 30) ||
          el.tagName
        );
      });
      if (label === null || label === "IFRAME") continue;
      if (!(await showsFocusIndicator(page))) missing.push(label);
    }
    expect(missing).toEqual([]);
  });

  test("the Preview and Code tabs work with arrow keys and Enter", async ({
    page,
  }) => {
    await stubWake(page);
    await page.goto(`/p/${slug}`);
    const preview = page.getByRole("tab", { name: "Preview" });
    await expect(preview).toBeVisible();
    await preview.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Code" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=code/);
    await expect(page.getByRole("tab", { name: "Code" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("the file tree opens a file with Enter and keeps focus movable with Tab", async ({
    page,
  }) => {
    await stubWake(page);
    await page.goto(`/p/${slug}?view=code`);
    const tree = page.getByRole("tree", { name: "Project files" });
    await expect(tree).toBeVisible();
    const items = tree.getByRole("treeitem");
    await expect(items.first()).toBeVisible();
    await items.first().focus();
    await page.keyboard.press("Tab");
    await expect(tree.locator(":focus")).toHaveCount(1);
    await tree.getByRole("treeitem", { name: /footer\.tsx/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/file=components(%2F|\/)footer\.tsx/);
    const footerTab = page.getByRole("tab", { name: /footer\.tsx/ });
    await expect(footerTab).toBeVisible();
    await footerTab.focus();
    await page.keyboard.press("Delete");
    await expect(footerTab).toHaveCount(0);
  });

  test("the follow-up prompt is a labelled textbox that takes keyboard input", async ({
    page,
  }) => {
    await stubWake(page);
    await page.goto(`/p/${slug}`);
    const textbox = page.getByRole("textbox", { name: "Message Vibe" });
    await textbox.focus();
    await page.keyboard.type("Add a contact form");
    await expect(textbox).toHaveValue("Add a contact form");
    expect(await showsFocusIndicator(page)).toBe(true);
  });
});
