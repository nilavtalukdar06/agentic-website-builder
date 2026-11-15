import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect as baseExpect, test } from "@playwright/test";
import { Inngest } from "inngest";
import { projectChannel } from "../src/inngest/channels";
import { createTestSession } from "./fixtures/session";

type Session = Awaited<ReturnType<typeof createTestSession>>;
const expect = baseExpect.configure({ timeout: 15_000 });
test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs database and auth env",
);
test.setTimeout(60_000);
let session: Session;
let projectId: string;
let slug: string;
test.beforeEach(async ({ context, page }) => {
  session = await createTestSession("GitHub Export Test");
  slug = `export-${randomUUID().slice(0, 8)}`;
  projectId = await session.addProject({ slug, name: "Export Demo" });
  await session.addVersion({
    projectId,
    number: 1,
    title: "Ready",
    files: {
      "app/page.tsx":
        "export default function Page() { return <main>Demo</main>; }",
    },
  });
  await context.addCookies([session.cookie]);
  await page.route("**/api/trpc/**", async (route) => {
    if (!route.request().url().includes("sandbox.wake"))
      return route.fallback();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { result: { data: { json: { status: "ready", previewUrl: null } } } },
      ]),
    });
  });
});
test.afterEach(async () => {
  await session?.cleanup();
});

test("defaults to private and requests repository access only from export", async ({
  page,
}) => {
  await session.addGithubAccount("read:user,user:email");
  await page.goto(`/p/${slug}?export=true`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Repository name")).toHaveValue(slug);
  await expect(
    dialog.getByRole("button", { name: "Private", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Public", exact: true }).click();
  await expect(
    dialog.getByText("Anyone can see this repository and its code."),
  ).toBeVisible();
  let body: Record<string, unknown> | undefined;
  await page.route("**/api/auth/link-social", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "OAUTH_TEST",
        message: "Test consent boundary",
      }),
    });
  });
  await dialog
    .getByRole("button", { name: "Connect GitHub", exact: true })
    .click();
  await expect(
    dialog.getByText("GitHub connection wasn’t completed"),
  ).toBeVisible();
  expect(body).toMatchObject({
    provider: "github",
    scopes: ["public_repo"],
    callbackURL: `/p/${slug}?export=true`,
  });
  expect(await session.exportState(projectId)).toBeUndefined();
  const response = await page.request.post("/api/auth/get-access-token", {
    data: { accountId: "anything" },
  });
  expect(response.status()).toBe(404);
});

test("queues a frozen version, survives reload, and shows persisted success with re-export", async ({
  page,
}) => {
  await session.addGithubAccount();
  await page.goto(`/p/${slug}`);
  await page
    .getByRole("button", { name: "Export to GitHub", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create repository and export" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Export queued" }),
  ).toBeVisible();
  const job = await session.exportState(projectId);
  expect(job).toMatchObject({
    private: true,
    name: slug,
    versionNumber: 1,
    attempt: 1,
  });
  const inngest = new Inngest({ id: "vibe-export-e2e", isDev: true });
  await inngest.realtime.publish(projectChannel({ projectId }).export, {
    exportId: job!.id,
    status: "SUCCEEDED",
    repositoryUrl: "https://github.com/vibe-test/demo",
    commitSha: "early",
  });
  await expect(page.getByText("Pushed to GitHub", { exact: true })).toHaveCount(
    0,
  );
  expect((await session.exportState(projectId))?.status).toBe("QUEUED");
  await session.setExportStatus(job!.id, "PREPARING");
  await page.reload();
  await expect(
    page.getByText("Preparing files", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Pushed to GitHub", { exact: true })).toHaveCount(
    0,
  );
  await session.setExportStatus(job!.id, "SUCCEEDED");
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "On GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/vibe-test/demo",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(page.getByRole("link", { name: "On GitHub" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Re-export", exact: true }).click();
  await expect(page.getByLabel("Repository name")).toHaveValue("demo");
  await expect(page.getByLabel("Repository name")).toBeDisabled();
  await page.getByRole("button", { name: "Push latest version" }).click();
  await expect
    .poll(async () => (await session.exportState(projectId))?.id)
    .not.toBe(job!.id);
});

test("failed push retries the same job with frozen repository and commit", async ({
  page,
}) => {
  await session.addGithubAccount();
  await page.goto(`/p/${slug}?export=true`);
  await page
    .getByRole("button", { name: "Create repository and export" })
    .click();
  await expect
    .poll(async () => (await session.exportState(projectId))?.status)
    .toBe("QUEUED");
  const job = (await session.exportState(projectId))!;
  await session.setExportStatus(job.id, "FAILED");
  await expect(
    page.getByRole("button", { name: "Retry export", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await page.getByRole("button", { name: "Retry export", exact: true }).click();
  await expect
    .poll(async () => (await session.exportState(projectId))?.attempt)
    .toBe(2);
  expect(await session.exportState(projectId)).toMatchObject({
    id: job.id,
    status: "QUEUED",
    repository: "vibe-test/demo",
    commitSha: "0123456789abcdef",
    versionId: job.versionId,
  });
});

test("an auth failure offers a reconnect instead of a retry that cannot work", async ({
  page,
}) => {
  await session.addGithubAccount();
  await page.goto(`/p/${slug}?export=true`);
  await page
    .getByRole("button", { name: "Create repository and export" })
    .click();
  await expect
    .poll(async () => (await session.exportState(projectId))?.status)
    .toBeDefined();
  const job = (await session.exportState(projectId))!;
  await session.setExportStatus(job.id, "FAILED");
  await session.setGithubScope(null);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Connect GitHub to retry", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry export", exact: true }),
  ).toHaveCount(0);
});

test("concurrent submissions create one reservation and refuse generation/restore", async ({
  page,
}) => {
  await session.addGithubAccount();
  const start = () =>
    page.request.post("/api/trpc/github.start", {
      data: { json: { projectId, name: slug, private: true } },
    });
  const responses = await Promise.all([start(), start()]);
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const restore = await page.request.post("/api/trpc/version.restore", {
    data: { json: { projectId, number: 1 } },
  });
  expect(restore.status()).toBe(409);
  const wake = await page.request.post("/api/trpc/sandbox.wake", {
    data: { json: { projectId } },
  });
  expect(await wake.json()).toMatchObject({
    result: { data: { json: { status: "busy" } } },
  });
  await page.goto(`/p/${slug}?export=true`);
  await expect(page.getByLabel("Send message")).toBeDisabled();
});

test("mobile opens the same export dialog and recovers an OAuth cancellation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await session.addGithubAccount();
  await page.goto(`/p/${slug}`);
  await page.getByRole("button", { name: "Show preview" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Repository name"),
  ).toHaveValue(slug);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`/p/${slug}?export=true&exportError=true`);
  await expect(
    page.getByText("GitHub connection wasn’t completed"),
  ).toBeVisible();
});

test("empty projects explain why there is nothing to export", async ({
  page,
}) => {
  const emptySlug = `empty-${randomUUID().slice(0, 8)}`;
  await session.addProject({ slug: emptySlug, name: "Empty" });
  await page.goto(`/p/${emptySlug}?export=true`);
  await expect(
    page.getByText("No complete version yet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create repository and export" }),
  ).toHaveCount(0);
});

test("export options have shaped loading and a recoverable fetch error", async ({
  page,
}) => {
  await session.addGithubAccount();
  let fail = true;
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const paths = url.pathname.split("/").at(-1)!.split(",");
    const index = paths.indexOf("github.status");
    if (index < 0 || !fail) return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const response = await route.fetch();
    const body = await response.json();
    body[index] = {
      error: {
        json: {
          message: "Temporary export status failure",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: "github.status",
          },
        },
      },
    };
    await route.fulfill({ response, status: 207, json: body });
  });
  await page.goto(`/p/${slug}?export=true`);
  await expect(page.getByLabel("Loading export options")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading" })).toBeVisible(
    { timeout: 25_000 },
  );
  fail = false;
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByLabel("Repository name")).toHaveValue(slug);
  await expect(
    page.getByRole("button", { name: "Create repository and export" }),
  ).toBeEnabled();
});
