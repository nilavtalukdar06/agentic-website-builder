import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

type Session = Awaited<ReturnType<typeof createTestSession>>;

const page1 =
  "export default function Page() {\n  return <main>Hello</main>;\n}\n";
const files = {
  "app/page.tsx": page1,
  "app/layout.tsx": "export default function Layout() {}\n",
};

let session: Session;
let slug: string;
let projectId: string;

async function stubWake(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    if (!route.request().url().includes("sandbox.wake"))
      return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { result: { data: { json: { status: "ready", previewUrl: null } } } },
      ]),
    });
  });
}

async function seed({ building = false } = {}) {
  slug = `edit-${randomUUID().slice(0, 8)}`;
  projectId = await session.addProject({ slug, name: "Editor site" });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Build a landing page",
    startedAt: new Date(Date.now() - 120_000),
    createdAt: new Date(Date.now() - 120_000),
  });
  if (!building) {
    await session.addMessage({
      id: `run_r1${slug}_reply`,
      projectId,
      role: "ASSISTANT",
      content: "Built it.",
      replyToId: prompt,
    });
  }
  await session.addVersion({
    projectId,
    number: 1,
    title: "First",
    files,
    runId: `r1${slug}`,
  });
}

const content = (page: Page) =>
  page.locator('.cm-content[aria-label="Edit app/page.tsx"]');

async function openCode(page: Page) {
  await stubWake(page);
  await page.goto(`/p/${slug}?view=code&file=app%2Fpage.tsx`);
}

async function typeAtEnd(page: Page, text: string) {
  await content(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

test.beforeEach(async ({ context }) => {
  session = await createTestSession("Editor Tester");
  await context.addCookies([session.cookie]);
});
test.afterEach(async () => {
  await session.cleanup();
});

test("edits autosave as an unsaved draft that survives a reload", async ({
  page,
}) => {
  await seed();
  await openCode(page);
  await expect(content(page)).toContainText("Hello");
  await expect(page.getByText("unsaved edits")).toHaveCount(0);

  await typeAtEnd(page, "// edited by me");
  await expect(
    page.getByText("Saved · open the preview to see it"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("You have unsaved edits")).toBeVisible({
    timeout: 15_000,
  });

  const rows = await session.versionRows(projectId);
  expect(rows.map((row) => row.status)).toEqual(["READY", "DRAFT"]);
  expect(rows[1].files["app/page.tsx"]).toContain("// edited by me");
  expect(rows[0].files["app/page.tsx"]).toBe(page1);

  await page.reload();
  await expect(content(page)).toContainText("// edited by me");
  await expect(page.getByText("You have unsaved edits")).toBeVisible();
});

test("save version turns the draft into the next version, free", async ({
  page,
}) => {
  await seed();
  await openCode(page);
  await typeAtEnd(page, "// v2");
  await expect(page.getByText("You have unsaved edits")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("You have unsaved edits")).toHaveCount(0, {
    timeout: 15_000,
  });
  const rows = await session.versionRows(projectId);
  expect(rows.map((row) => [row.number, row.status, row.creditCost])).toEqual([
    [1, "READY", 0],
    [2, "READY", 0],
  ]);
  expect(rows[1].title).toBe("Edited app/page.tsx");
  expect(rows[1].files["app/page.tsx"]).toContain("// v2");
});

test("discard asks first and brings back the saved file", async ({ page }) => {
  await seed();
  await openCode(page);
  await typeAtEnd(page, "// oops");
  await expect(page.getByText("You have unsaved edits")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Discard your edits?" });
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByText("You have unsaved edits")).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Discard your edits?" })
    .getByRole("button", { name: "Discard edits" })
    .click();
  await expect(page.getByText("You have unsaved edits")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(content(page)).not.toContainText("// oops");
  expect(
    (await session.versionRows(projectId)).map((row) => row.status),
  ).toEqual(["READY"]);
});

test("a follow-up message saves the edits as a version first", async ({
  page,
}) => {
  await seed();
  await openCode(page);
  await typeAtEnd(page, "// before the follow-up");
  await expect(page.getByText("You have unsaved edits")).toBeVisible({
    timeout: 15_000,
  });

  const input = page.getByRole("textbox", { name: "Message Vibe" });
  const send = page.getByRole("button", { name: "Send message" });
  await expect(async () => {
    await input.fill("Make the heading bigger");
    await expect(send).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await send.click();
  await expect(
    page.getByRole("log").getByText("Make the heading bigger"),
  ).toBeVisible({ timeout: 20_000 });

  const rows = await session.versionRows(projectId);
  expect(rows.map((row) => [row.number, row.status])).toEqual([
    [1, "READY"],
    [2, "READY"],
  ]);
  expect(rows[1].files["app/page.tsx"]).toContain("// before the follow-up");
});

test("while an agent is building, the editor and the terminal are locked", async ({
  page,
}) => {
  await seed({ building: true });
  await openCode(page);
  await expect(page.getByText(/Vibe is building/).first()).toBeVisible();
  await expect(content(page)).toHaveAttribute("contenteditable", "false");
  await page.getByRole("button", { name: "Open the terminal" }).click();
  await expect(page.getByLabel("Terminal command")).toBeDisabled();
});

test("the terminal runs commands and shows their output", async ({ page }) => {
  await seed();
  await stubWake(page);
  await page.route("**/api/terminal", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: `ran: ${body.command}\n\n[exit 0]\n`,
    });
  });
  await page.goto(`/p/${slug}?view=code&file=app%2Fpage.tsx`);
  await page.getByRole("button", { name: "Open the terminal" }).click();
  const input = page.getByLabel("Terminal command");
  await input.fill("npm install zod");
  await input.press("Enter");
  await expect(page.getByText("ran: npm install zod")).toBeVisible();
  await expect(page.getByText("[exit 0]")).toBeVisible();
  await input.press("ArrowUp");
  await expect(input).toHaveValue("npm install zod");
});

test("the real terminal route says when there is no sandbox to run in", async ({
  page,
}) => {
  await seed();
  await openCode(page);
  await page.getByRole("button", { name: "Open the terminal" }).click();
  const input = page.getByLabel("Terminal command");
  await input.fill("ls");
  await input.press("Enter");
  await expect(page.getByText(/preview isn't running/)).toBeVisible({
    timeout: 15_000,
  });
});
