import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

type Session = Awaited<ReturnType<typeof createTestSession>>;

let session: Session;
let suffix: string;

test.beforeEach(async ({ context }) => {
  session = await createTestSession("E2E Builder");
  suffix = randomUUID().slice(0, 8);
  await context.addCookies([session.cookie]);
});

test.afterEach(async () => {
  await session.cleanup();
});

test("home shows the shell, prompt and empty recent projects", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What should we build today?" }),
  ).toBeVisible();
  await expect(page.getByText("No projects yet").first()).toBeVisible();
  await expect(page.getByText("E2E Builder")).toBeVisible();
  await expect(page.getByRole("link", { name: "Top up" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create project" }),
  ).toBeDisabled();
});

test("creating a project from the prompt opens it", async ({ page }) => {
  await page.goto("/");
  const prompt = `A landing page for Ember ${suffix} roastery. Warm and editorial.`;
  const textbox = page.getByRole("textbox", {
    name: "Describe the website to build",
  });
  const submit = page.getByRole("button", { name: "Create project" });
  await expect(async () => {
    await textbox.fill(prompt);
    await expect(submit).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await submit.click();

  await expect(page).toHaveURL(
    new RegExp(`/p/landing-page-for-ember-${suffix}-roastery$`),
    { timeout: 15_000 },
  );
  await expect(
    page.getByText(`Landing page for Ember ${suffix} roastery`).first(),
  ).toBeVisible();
  await expect(page.getByText(prompt)).toBeVisible();
  await expect(page.getByText("Building", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Switch project$/ }).click();
  await page.getByRole("menuitem", { name: "All projects" }).click();
  await expect(page).toHaveURL("/projects");
  await expect(
    page.getByRole("list", { name: "Projects" }).getByRole("link", {
      name: new RegExp(`Landing page for Ember ${suffix} roastery`),
    }),
  ).toBeVisible();
});

test("a pasted key is rejected without creating a project, even with zero credits", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe the website to build",
  });
  const submit = page.getByRole("button", { name: "Create project" });
  await expect(async () => {
    await input.fill("Build key sk-9Y5Q7Z2H8N4W6R3T1M0B9V8C7L6K5J4D");
    await expect(submit).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await submit.click();
  await expect(
    page.getByText(
      "Remove API keys, tokens and connection strings from your request before sending it. Vibe doesn't store keys.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL("/");
  expect(await session.projectCount()).toBe(0);
});

test("projects page searches, filters and sorts through the URL", async ({
  page,
}) => {
  const day = 24 * 60 * 60 * 1000;
  await session.addProject({
    slug: `alpha-${suffix}`,
    name: "Alpha site",
    description: "Coffee shop",
    githubRepo: "me/alpha",
    updatedAt: new Date(Date.now() - day),
  });
  await session.addProject({
    slug: `beta-${suffix}`,
    name: "Beta site",
    description: "Vet clinic",
  });

  await page.goto("/projects");
  await expect(
    page.getByText("2 projects, each running in its own sandbox."),
  ).toBeVisible();
  const cards = page
    .getByRole("list", { name: "Projects" })
    .getByRole("listitem");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Beta site");
  await expect(cards.nth(1)).toContainText("Edited yesterday");

  await page.getByRole("tab", { name: "On GitHub" }).click();
  await expect(page).toHaveURL(/filter=github/);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Alpha site");
  await expect(cards.first()).toContainText("On GitHub");

  await page.getByRole("tab", { name: "All" }).click();
  await expect(page).not.toHaveURL(/filter=/);
  await page.getByRole("searchbox", { name: "Search projects" }).fill("vet");
  await expect(page).toHaveURL(/q=vet/);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Beta site");

  await page.getByRole("searchbox", { name: "Search projects" }).fill("zzz");
  await expect(page.getByText("No projects match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards).toHaveCount(2);

  await page.goto("/projects?sort=name");
  await expect(cards.first()).toContainText("Alpha site");

  await page.goto("/projects?filter=local&q=alpha");
  await expect(page.getByText("No projects match")).toBeVisible();
});

test("sidebar lists recent projects and ⌘K opens one", async ({ page }) => {
  await session.addProject({ slug: `gamma-${suffix}`, name: "Gamma site" });
  await page.goto("/");
  const sidebarLink = page
    .locator("[data-sidebar='sidebar']")
    .getByRole("link", { name: "Gamma site" });
  await expect(sidebarLink).toHaveAttribute("href", `/p/gamma-${suffix}`);

  const palette = page.getByRole("dialog");
  await page
    .locator("[data-sidebar='sidebar']")
    .getByRole("button", { name: "Search" })
    .click();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(async () => {
    if (!(await palette.isVisible())) {
      await page.keyboard.press("Control+k");
    }
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  await palette.getByPlaceholder("Search projects and pages…").fill("Gamma");
  await palette.getByRole("option", { name: /Gamma site/ }).click();
  await expect(page).toHaveURL(`/p/gamma-${suffix}`);
});

test("someone else's or a missing project is not found", async ({ page }) => {
  await page.goto(`/p/missing-${suffix}`);
  await expect(page.getByText("Project not found")).toBeVisible();
  await expect(
    page.locator('head meta[name="robots"]').first(),
  ).toHaveAttribute("content", /noindex/);
});

test("the sidebar collapses to icons and Appearance sets the theme", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(
    page.locator("[data-slot=sidebar][data-state=collapsed]"),
  ).toHaveAttribute("data-collapsible", "icon");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(
    page.locator("[data-slot=sidebar][data-state=expanded]"),
  ).toBeAttached();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Appearance" }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveClass(/theme-light/);
  await expect(
    page.getByRole("menuitemradio", { name: "Light" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
});

test("home and projects are server-rendered with the user's data", async ({
  page,
}) => {
  await session.addProject({ slug: `ssr-${suffix}`, name: "SSR probe site" });
  for (const path of ["/", "/projects"]) {
    const html = (await (await page.goto(path))?.text()) ?? "";
    expect(html, path).toContain("SSR probe site");
    expect(html, path).not.toContain('data-sidebar="menu-skeleton"');
  }
});
