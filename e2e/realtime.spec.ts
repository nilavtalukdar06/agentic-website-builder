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
    expect(warnings).toEqual([]);
    await expect(page.getByText("credits used")).toContainText("12");
  } finally {
    await session.cleanup();
  }
});
