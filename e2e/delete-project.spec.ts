import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

type Session = Awaited<ReturnType<typeof createTestSession>>;

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

const longName =
  "Expense tracker with Next Js using local storage and charts for every month";

let session: Session;
let slug: string;
let projectId: string;

async function stubWake(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    if (!route.request().url().includes("sandbox.wake"))
      return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { result: { data: { json: { status: "empty", previewUrl: null } } } },
      ]),
    });
  });
}

test.beforeEach(async ({ context, page }) => {
  session = await createTestSession("E2E Deleter");
  slug = `del-${randomUUID().slice(0, 8)}`;
  projectId = await session.addProject({ slug, name: longName });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Build me an expense tracker",
    startedAt: new Date(Date.now() - 60_000),
    createdAt: new Date(Date.now() - 60_000),
  });
  await session.addMessage({
    projectId,
    role: "ASSISTANT",
    content: "Done.",
    replyToId: prompt,
    createdAt: new Date(Date.now() - 50_000),
    parts: [{ type: "text", text: "Done." }],
  });
  await session.addVersion({
    projectId,
    number: 1,
    title: "First version",
    files: { "app/page.tsx": "export default function Page() {}\n" },
    createdAt: new Date(Date.now() - 50_000),
  });
  await context.addCookies([session.cookie]);
  await stubWake(page);
});

test.afterEach(async () => {
  await session.cleanup();
});

test("a long project name stays inside the chat header", async ({ page }) => {
  await page.goto(`/p/${slug}`);
  const header = page.locator('[data-slot="chat-header"]');
  await expect(header).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide chat" })).toBeVisible();
  const box = await header.boundingBox();
  const collapse = await page
    .getByRole("button", { name: "Hide chat" })
    .boundingBox();
  const history = await page
    .getByRole("button", { name: "Version history" })
    .boundingBox();
  expect(box).not.toBeNull();
  const right = box!.x + box!.width;
  expect(collapse!.x + collapse!.width).toBeLessThanOrEqual(right + 0.5);
  expect(history!.x + history!.width).toBeLessThanOrEqual(right + 0.5);
  expect(
    await header.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("deleting a project needs its exact name, then removes everything", async ({
  page,
}) => {
  await page.goto(`/p/${slug}`);
  await page.getByRole("button", { name: /Switch project/ }).click();
  await page.getByRole("menuitem", { name: "Delete project" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete project" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Delete project" });
  const input = dialog.getByLabel(/to confirm/);
  await expect(confirm).toBeDisabled();

  await input.fill(longName.toLowerCase());
  await expect(confirm).toBeDisabled();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await session.projectIdBySlug(slug)).toBe(projectId);

  await page.getByRole("button", { name: /Switch project/ }).click();
  await page.getByRole("menuitem", { name: "Delete project" }).click();
  await expect(input).toHaveValue("");
  await input.fill(longName);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
  await expect(page.getByText("Project deleted")).toBeVisible();
  expect(await session.projectIdBySlug(slug)).toBeUndefined();
  expect(await session.messageCount(projectId)).toBe(0);

  await page.goto(`/p/${slug}`);
  await expect(page.getByText("Project not found")).toBeVisible();
});
