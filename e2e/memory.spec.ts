import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

type Session = Awaited<ReturnType<typeof createTestSession>>;
let session: Session;

test.beforeEach(async ({ context }) => {
  session = await createTestSession("Memory Tester");
  await context.addCookies([session.cookie]);
});
test.afterEach(async () => {
  await session.cleanup();
});

const ok = (json: unknown) => JSON.stringify([{ result: { data: { json } } }]);

async function stubList(
  page: Page,
  respond: () => { status: number; body: string },
) {
  await page.route("**/api/trpc/memory.list**", async (route) => {
    const { status, body } = respond();
    await route.fulfill({ status, contentType: "application/json", body });
  });
}

async function openMemory(page: Page) {
  const opener = page.getByRole("button", { name: "Open sidebar" });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Memory" }).click();
  return page.getByRole("dialog", { name: "Memory" });
}

test("says memory isn't available when the server has no memory key", async ({
  page,
}) => {
  test.skip(
    !!process.env.SUPERMEMORY_API_KEY,
    "memory is configured on this server",
  );
  await page.goto("/");
  const dialog = await openMemory(page);
  await expect(dialog.getByText("Memory isn’t available")).toBeVisible();
  await expect(dialog.getByRole("switch")).toHaveCount(0);
});

test("lists what's remembered, forgets one item and keeps the switch in the database", async ({
  page,
}) => {
  let items = [
    { id: "m1", memory: "Prefers dark minimal designs", kind: "static" },
    { id: "m2", memory: "Likes a teal accent", kind: "dynamic" },
  ];
  await stubList(page, () => ({
    status: 200,
    body: ok({ configured: true, enabled: true, items }),
  }));
  await page.route("**/api/trpc/memory.forget**", async (route) => {
    items = items.filter((item) => item.id !== "m1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: ok({ forgotten: 1 }),
    });
  });
  await page.goto("/");
  const dialog = await openMemory(page);
  await expect(dialog.getByText("Prefers dark minimal designs")).toBeVisible();
  await expect(dialog.getByText("Likes a teal accent")).toBeVisible();

  await dialog
    .getByRole("button", { name: "Forget: Prefers dark minimal designs" })
    .click();
  await expect(dialog.getByText("Prefers dark minimal designs")).toHaveCount(0);
  await expect(dialog.getByText("Likes a teal accent")).toBeVisible();

  expect(await session.memoryEnabled()).toBe(true);
  await dialog.getByRole("switch", { name: "Use memory" }).click();
  await expect.poll(() => session.memoryEnabled()).toBe(false);
});

test("shows an error with retry, then the empty state", async ({ page }) => {
  let failing = true;
  await stubList(page, () => {
    return failing
      ? {
          status: 500,
          body: JSON.stringify([
            {
              error: {
                json: {
                  message: "boom",
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                },
              },
            },
          ]),
        }
      : {
          status: 200,
          body: ok({ configured: true, enabled: true, items: [] }),
        };
  });
  await page.goto("/");
  const dialog = await openMemory(page);
  await expect(dialog.getByText("Couldn't load your memory")).toBeVisible({
    timeout: 15_000,
  });
  failing = false;
  await dialog.getByRole("button", { name: /try again/i }).click();
  await expect(dialog.getByText("Nothing remembered yet")).toBeVisible();
});

test("clear all asks for confirmation first", async ({ page }) => {
  let cleared = 0;
  await stubList(page, () => ({
    status: 200,
    body: ok({
      configured: true,
      enabled: true,
      items: [{ id: "m1", memory: "Prefers rounded cards", kind: "static" }],
    }),
  }));
  await page.route("**/api/trpc/memory.clear**", async (route) => {
    cleared++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: ok({ cleared: true }),
    });
  });
  await page.goto("/");
  const dialog = await openMemory(page);
  await dialog.getByRole("button", { name: "Clear all memory" }).click();
  const confirm = page.getByRole("dialog", { name: "Clear all memory?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(cleared).toBe(0);
  await dialog.getByRole("button", { name: "Clear all memory" }).click();
  await page
    .getByRole("dialog", { name: "Clear all memory?" })
    .getByRole("button", { name: "Clear all", exact: true })
    .click();
  await expect.poll(() => cleared).toBe(1);
});

test("the dialog fits a 320 px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await stubList(page, () => ({
    status: 200,
    body: ok({
      configured: true,
      enabled: true,
      items: [
        {
          id: "m1",
          memory:
            "Prefers a very long description that has to wrap onto several lines without pushing the dialog wider than the phone screen",
          kind: "static",
        },
      ],
    }),
  }));
  await page.goto("/");
  const dialog = await openMemory(page);
  await expect(dialog.getByText(/Prefers a very long/)).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a remember reply and a forget preview render in the chat", async ({
  page,
}) => {
  const slug = `mem-${randomUUID().slice(0, 8)}`;
  const projectId = await session.addProject({ slug, name: "Memory chat" });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Remember that I prefer dark minimal designs",
    createdAt: new Date(Date.now() - 60_000),
  });
  await session.addMessage({
    projectId,
    role: "ASSISTANT",
    content: "Got it. I'll remember this for your future builds.",
    replyToId: prompt,
    parts: [
      {
        type: "memory",
        action: "remember",
        status: "saved",
        text: "I prefer dark minimal designs",
        reason: null,
        matches: [],
      },
    ],
  });
  const second = await session.addMessage({
    projectId,
    role: "USER",
    content: "Forget that I like teal",
    createdAt: new Date(Date.now() - 30_000),
  });
  await session.addMessage({
    projectId,
    role: "ASSISTANT",
    content: "I found 1 thing I remember that matches.",
    replyToId: second,
    parts: [
      {
        type: "memory",
        action: "forget",
        status: "preview",
        text: "I like teal",
        reason: null,
        matches: [{ id: "m9", memory: "Likes a teal accent", scope: "user" }],
      },
    ],
  });

  let forgotten: unknown = null;
  await page.route("**/api/trpc/memory.forget**", async (route) => {
    forgotten = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: ok({ forgotten: 1 }),
    });
  });

  await page.goto(`/p/${slug}`);
  await expect(page.getByText("Remembered")).toBeVisible();
  await expect(page.getByText("Likes a teal accent")).toBeVisible();
  await expect(page.getByText("All projects")).toBeVisible();
  await page.getByRole("button", { name: "Forget this" }).click();
  await expect(page.getByText("Forgotten.")).toBeVisible();
  expect(JSON.stringify(forgotten)).toContain("m9");
});
