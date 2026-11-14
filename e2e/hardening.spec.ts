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

test.beforeEach(async ({ context }) => {
  session = await createTestSession("E2E Hardening");
  await context.addCookies([session.cookie]);
});

test.afterEach(async () => {
  await session.cleanup();
});

test("pages carry the security headers", async ({ request }) => {
  const response = await request.get("/sign-in");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=");
});

test("uploads are limited per user and answer 429 with Retry-After", async ({
  page,
}) => {
  await session.exhaustRateLimit("upload", 10 * 60_000);
  const response = await page.request.post("/api/attachments", {
    multipart: {
      file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") },
    },
  });
  expect(response.status()).toBe(429);
  expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
  expect(await response.json()).toEqual({
    error: "Too many uploads. Try again in a few minutes.",
  });
});

test("the realtime token endpoint is limited per user", async ({ page }) => {
  await session.exhaustRateLimit("realtime-token", 10 * 60_000);
  const response = await page.request.post("/api/realtime/token", {
    data: { projectId: "anything" },
  });
  expect(response.status()).toBe(429);
  expect(response.headers()["retry-after"]).toBeTruthy();
});

test("a user who sent too many prompts sees a friendly message and no project is created", async ({
  page,
}) => {
  await session.exhaustRateLimit("agent", 10 * 60_000);
  await page.goto("/");
  const textbox = page.getByRole("textbox", {
    name: "Describe the website to build",
  });
  const submit = page.getByRole("button", { name: "Create project" });
  await expect(async () => {
    await textbox.fill(`A landing page for Birch ${randomUUID().slice(0, 6)}`);
    await expect(submit).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await submit.click();
  await expect(page.getByText(/too often|too quickly/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL("/");
  expect(await session.projectCount()).toBe(0);
});

test("a rate-limited follow-up keeps the draft and saves nothing", async ({
  page,
}) => {
  const slug = `rl-${randomUUID().slice(0, 8)}`;
  const projectId = await session.addProject({ slug, name: "Limited" });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Build a site",
    createdAt: new Date(Date.now() - 60_000),
  });
  await session.addMessage({
    projectId,
    role: "ASSISTANT",
    replyToId: prompt,
    content: "Done.",
    parts: [{ type: "text", text: "Done." }],
  });
  await session.exhaustRateLimit("agent", 10 * 60_000);
  await page.goto(`/p/${slug}`);
  const textbox = page.getByRole("textbox", { name: "Message Vibe" });
  const send = page.getByRole("button", { name: "Send message" });
  await expect(async () => {
    await textbox.fill("Add a pricing section");
    await expect(send).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await send.click();
  await expect(page.getByText(/too often|too quickly/i).first()).toBeVisible({
    timeout: 15_000,
  });
  expect(await session.messageCount(projectId)).toBe(2);
});
