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
  await expect(page.getByText("Personal workspace")).toBeVisible();
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
  await expect(page.getByText("Waiting for the agent")).toBeVisible();

  await page.getByRole("link", { name: "Back to projects" }).click();
  await expect(page).toHaveURL("/projects");
  await expect(
    page.getByRole("list", { name: "Projects" }).getByRole("link", {
      name: new RegExp(`Landing page for Ember ${suffix} roastery`),
    }),
  ).toBeVisible();
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

test("Templates is disabled and breadcrumbs follow the page", async ({
  page,
}) => {
  await page.goto("/projects");
  await expect(
    page.getByRole("navigation", { name: "breadcrumb" }).getByText("Projects"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Templates" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
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
