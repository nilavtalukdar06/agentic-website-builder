import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Inngest, type Realtime } from "inngest";
import { projectChannel } from "../src/inngest/channels";
import { createTestSession } from "./fixtures/session";

const devServer = process.env.INNGEST_DEV?.startsWith("http")
  ? process.env.INNGEST_DEV
  : "http://localhost:8288";

async function devServerUp() {
  try {
    const response = await fetch(devServer, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test("live agent events stream into the chat and the preview overlay", async ({
  page,
}) => {
  test.skip(
    !process.env.DATABASE_URL || !(await devServerUp()),
    "needs the database and a running Inngest dev server",
  );
  const session = await createTestSession("E2E Realtime");
  try {
    await page.context().addCookies([session.cookie]);
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (/Collapsible/.test(message.text())) warnings.push(message.text());
    });
    const suffix = randomUUID().slice(0, 8);
    const projectId = await session.addProject({
      slug: `live-${suffix}`,
      name: "Live site",
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Build a bakery site",
      startedAt: new Date(),
    });

    const tokenResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/realtime/token") &&
        response.status() === 200,
    );
    await page.goto(`/p/live-${suffix}`);
    await tokenResponse;
    await expect(page.getByText("Starting…")).toBeVisible();

    const inngest = new Inngest({ id: "vibe-e2e", isDev: true });
    const channel = projectChannel({ projectId });
    type Topics = typeof projectChannel.$infer;
    const publish = <T extends keyof Topics>(topic: T, data: Topics[T]) =>
      inngest.realtime.publish(
        channel[topic] as Realtime.TopicRef<Topics[T]>,
        data,
      );

    await expect(async () => {
      await publish("status", { state: "building" });
      await expect(page.getByText("Building…")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    await publish("task", {
      kind: "sandbox",
      label: "Created sandbox from the Next.js template",
    });
    await publish("file", {
      phase: "started",
      path: "components/hero.tsx",
      verb: "created",
    });
    await publish("tool", {
      phase: "call",
      callId: "c1",
      name: "terminal",
      command: "npm run lint",
    });
    await publish("tool", {
      phase: "output",
      callId: "c1",
      name: "terminal",
      chunk: "No problems found",
    });
    await publish("task", { kind: "skill", name: "shadcn" });
    await publish("task", {
      kind: "note",
      label: "Planned Ember & Oak: 1 page, 6 files",
    });
    await publish("task", { kind: "read", paths: ["app/page.tsx"] });
    await publish("task", {
      kind: "file",
      verb: "edited",
      path: "app/globals.css",
      lines: 40,
    });
    await publish("text", {
      turn: 3,
      delta: "Done.\n<task_summary>Raw notes</task_summary>",
    });
    await publish("credits", { used: 12 });

    const chat = page.getByRole("log");
    const overlay = page.locator('[data-slot="generating-overlay"]');
    await expect(
      chat.getByText("Created sandbox from the Next.js template"),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-slot="generating-overlay"]')
        .getByText("components/hero.tsx", { exact: true }),
    ).toBeVisible();
    await expect(chat.getByText("Loaded skill")).toBeVisible();
    await expect(overlay.getByText("Loaded skill")).toBeVisible();
    await expect(
      chat.getByText("Planned Ember & Oak: 1 page, 6 files"),
    ).toBeVisible();
    await expect(
      overlay.getByText("Planned Ember & Oak: 1 page, 6 files"),
    ).toBeVisible();
    await expect(overlay.getByText("Running", { exact: true })).toBeVisible();
    await expect(
      overlay.getByText("npm run lint", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("log").getByText("app/page.tsx", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("+40")).toBeVisible();
    await expect(page.getByText("Done.", { exact: true })).toBeVisible();
    await expect(page.getByText(/task_summary|Raw notes/)).toHaveCount(0);
    const tool = page.getByRole("button", { name: /npm run lint/ });
    await expect(tool).toBeVisible();
    await expect(page.getByText("No problems found")).toBeHidden();
    await tool.click();
    await expect(page.getByText("No problems found")).toBeVisible();
    await publish("tool", {
      phase: "result",
      callId: "c1",
      name: "terminal",
      exitCode: 0,
    });
    await expect(page.getByText("Completed")).toBeVisible();
    await page.route("https://www.browserbase.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<button>Remote control</button>",
      }),
    );
    await publish("browser", {
      phase: "session",
      liveUrl: "https://www.browserbase.com/devtools-fullscreen/e2e",
      round: 0,
    });
    const check = {
      id: "home-desktop",
      kind: "page" as const,
      label: "Home page loads",
      route: "/",
      viewport: "desktop" as const,
      status: "running" as const,
      detail: null,
    };
    await publish("browser", { phase: "check", check });
    const browser = page.getByRole("region", {
      name: "Checking the site in a cloud browser",
    });
    await expect(browser).toBeVisible();
    await expect(browser.getByText("Home page loads")).toBeVisible();
    const frame = browser.locator("iframe");
    await expect(frame).toHaveAttribute("inert", "");
    await expect(frame).toHaveAttribute("tabindex", "-1");
    await expect(frame).toHaveCSS("pointer-events", "none");
    await frame.evaluate((element) => (element as HTMLElement).focus());
    await expect(frame).not.toBeFocused();
    await publish("browser", {
      phase: "check",
      check: { ...check, status: "passed" },
    });
    await expect(browser.getByText("1 passed")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Watch the browser check the site" })
      .click();
    await expect(browser).toBeVisible();
    expect(
      await browser.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await publish("browser", {
      phase: "check",
      check: {
        ...check,
        id: "home-phone",
        viewport: "phone",
        status: "failed",
        detail: "Content overflows the phone viewport",
      },
    });
    await expect(
      browser.getByText("Content overflows the phone viewport"),
    ).toBeVisible();
    await publish("browser", {
      phase: "closed",
      status: "failed",
      summary: "One phone check failed",
    });
    await expect(browser).toHaveCount(0);
    await expect(overlay).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(warnings).toEqual([]);
    await expect(page.getByText("credits used")).toContainText("12");
  } finally {
    await session.cleanup();
  }
});

test("the agent's browser check streams into the preview on desktop and phone", async ({
  page,
}) => {
  test.skip(
    !process.env.DATABASE_URL || !(await devServerUp()),
    "needs the database and a running Inngest dev server",
  );
  const session = await createTestSession("E2E Browser");
  try {
    await page.context().addCookies([session.cookie]);
    const suffix = randomUUID().slice(0, 8);
    const projectId = await session.addProject({
      slug: `qa-${suffix}`,
      name: "Checked site",
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Build a todo app",
      startedAt: new Date(),
    });
    const tokenResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/realtime/token") &&
        response.status() === 200,
    );
    await page.goto(`/p/qa-${suffix}`);
    await tokenResponse;

    const inngest = new Inngest({ id: "vibe-e2e", isDev: true });
    const channel = projectChannel({ projectId });
    type Topics = typeof projectChannel.$infer;
    const publish = <T extends keyof Topics>(topic: T, data: Topics[T]) =>
      inngest.realtime.publish(
        channel[topic] as Realtime.TopicRef<Topics[T]>,
        data,
      );
    await expect(async () => {
      await publish("status", { state: "building" });
      await expect(page.getByText("Building…")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    const check = {
      id: "0-page-phone-/",
      kind: "page" as const,
      label: "Open / at phone width",
      route: "/",
      viewport: "phone" as const,
      status: "running" as const,
      detail: null,
    };
    await publish("browser", { phase: "session", liveUrl: null, round: 0 });
    await publish("browser", { phase: "check", check });

    const live = page.getByRole("region", {
      name: "Checking the site in a cloud browser",
    });
    await expect(live).toBeVisible();
    await expect(live.getByText("Connecting to the browser…")).toBeVisible();
    await expect(live.getByText("Open / at phone width")).toBeVisible();

    await publish("browser", {
      phase: "check",
      check: {
        ...check,
        status: "failed",
        detail: "the page scrolls sideways (content is 520px wide)",
      },
    });
    await expect(live.getByText("1 failed")).toBeVisible();
    await expect(
      live.getByText("the page scrolls sideways (content is 520px wide)"),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const watch = page.getByRole("button", {
      name: "Watch the browser check the site",
    });
    await expect(watch).toBeVisible();
    await watch.click();
    await expect(live).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await publish("browser", {
      phase: "closed",
      status: "failed",
      summary: "The browser found 1 problem.",
    });
    await expect(live).toBeHidden();
  } finally {
    await session.cleanup();
  }
});

test("a running prompt's live reply stays under it, ahead of a queued follow-up, and says Stopping after Stop", async ({
  page,
}) => {
  test.skip(
    !process.env.DATABASE_URL || !(await devServerUp()),
    "needs the database and a running Inngest dev server",
  );
  const session = await createTestSession("E2E Live Order");
  try {
    await page.context().addCookies([session.cookie]);
    const suffix = randomUUID().slice(0, 8);
    const projectId = await session.addProject({
      slug: `order-${suffix}`,
      name: "Order site",
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Build a bakery site",
      startedAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 60_000),
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Also add a footer",
      createdAt: new Date(Date.now() - 30_000),
    });

    const tokenResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/realtime/token") &&
        response.status() === 200,
    );
    await page.goto(`/p/order-${suffix}`);
    await tokenResponse;

    const inngest = new Inngest({ id: "vibe-e2e-order", isDev: true });
    const channel = projectChannel({ projectId });
    await expect(async () => {
      await inngest.realtime.publish(
        channel.status as Realtime.TopicRef<{ state: "thinking" }>,
        { state: "thinking" },
      );
      await expect(page.getByText("Thinking…")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    const order = async () => {
      const text = await page.getByRole("log").innerText();
      return [
        text.indexOf("Build a bakery site"),
        text.indexOf("Thinking…"),
        text.indexOf("Also add a footer"),
      ];
    };
    const [first, live, queued] = await order();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(live).toBeGreaterThan(first);
    expect(queued).toBeGreaterThan(live);

    await page.getByRole("button", { name: "Stop" }).click();
    const log = page.getByRole("log");
    await expect(log.getByText("Stopping…").first()).toBeVisible();
    await expect(log.getByText("Thinking…")).toHaveCount(0);
  } finally {
    await session.cleanup();
  }
});

test("a new message after a finished build starts a fresh live reply without a reload", async ({
  page,
}) => {
  test.skip(
    !process.env.DATABASE_URL || !(await devServerUp()),
    "needs the database and a running Inngest dev server",
  );
  test.setTimeout(90_000);
  const session = await createTestSession("E2E Fresh Run");
  try {
    await page.context().addCookies([session.cookie]);
    const suffix = randomUUID().slice(0, 8);
    const projectId = await session.addProject({
      slug: `fresh-${suffix}`,
      name: "Fresh site",
    });
    const first = await session.addMessage({
      projectId,
      role: "USER",
      content: "Build a bakery site",
      startedAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 60_000),
    });

    const inngest = new Inngest({ id: "vibe-e2e-fresh", isDev: true });
    const channel = projectChannel({ projectId });
    type Topics = typeof projectChannel.$infer;
    const publish = <T extends keyof Topics>(topic: T, data: Topics[T]) =>
      inngest.realtime.publish(
        channel[topic] as Realtime.TopicRef<Topics[T]>,
        data,
      );

    const tokenResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/realtime/token") &&
        response.status() === 200,
    );
    await page.goto(`/p/fresh-${suffix}`);
    await tokenResponse;
    const chat = page.getByRole("log");

    await expect(async () => {
      await publish("task", {
        kind: "note",
        label: "First run: created card.tsx",
      });
      await expect(chat.getByText("First run: created card.tsx")).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });

    await session.addMessage({
      projectId,
      role: "ASSISTANT",
      content: "Done with the first build.",
      replyToId: first,
    });
    await expect(chat.getByText("Done with the first build.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(chat.getByText("First run: created card.tsx")).toHaveCount(0);

    const input = page.getByRole("textbox", { name: "Message Vibe" });
    const send = page.getByRole("button", { name: "Send message" });
    await expect(async () => {
      await input.fill("Add a footer");
      await expect(send).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await send.click();
    await expect(chat.getByText("Add a footer")).toBeVisible({
      timeout: 20_000,
    });
    await expect(chat.getByText("Starting…")).toBeVisible({ timeout: 20_000 });
    await expect(chat.getByText("First run: created card.tsx")).toHaveCount(0);

    await expect(async () => {
      await publish("status", { state: "thinking" });
      await publish("task", { kind: "note", label: "Second run: footer" });
      await expect(chat.getByText("Second run: footer")).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(chat.getByText("First run: created card.tsx")).toHaveCount(0);
  } finally {
    await session.cleanup();
  }
});
