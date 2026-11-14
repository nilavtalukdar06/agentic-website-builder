import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

const previewHost = `localhost:${process.env.E2E_PORT ?? 3000}`;

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

test("a prompt becomes a project, the build finishes, and the preview opens", async ({
  page,
  context,
}) => {
  const session = await createTestSession("E2E Flow");
  try {
    await context.addCookies([session.cookie]);
    await stubWake(page);
    const suffix = randomUUID().slice(0, 8);
    const prompt = `A landing page for Fern ${suffix} bakery. Soft and warm.`;
    const slug = `landing-page-for-fern-${suffix}-bakery`;

    await page.goto("/");
    const textbox = page.getByRole("textbox", {
      name: "Describe the website to build",
    });
    const submit = page.getByRole("button", { name: "Create project" });
    await expect(async () => {
      await textbox.fill(prompt);
      await expect(submit).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await submit.click();

    await expect(page).toHaveURL(new RegExp(`/p/${slug}$`), {
      timeout: 15_000,
    });
    await expect(page.getByText(prompt)).toBeVisible();
    await expect(page.getByText("Building", { exact: true })).toBeVisible();

    const projectId = await session.projectIdBySlug(slug);
    expect(projectId).toBeTruthy();
    const messageId = await session.firstMessageId(projectId!);
    await session.addMessage({
      id: `run_flow${suffix}_reply`,
      projectId: projectId!,
      role: "ASSISTANT",
      replyToId: messageId,
      content: "Your Fern bakery page is ready.",
      parts: [{ type: "text", text: "Your Fern bakery page is ready." }],
    });
    await session.addVersion({
      projectId: projectId!,
      number: 1,
      title: "First version",
      runId: `flow${suffix}`,
      creditCost: 12,
      files: {
        "app/page.tsx": "export default function Page() {\n  return null;\n}\n",
      },
    });
    await session.setPreview(projectId!, `http://${previewHost}/terms`);

    await expect(page.getByText("Your Fern bakery page is ready.")).toBeVisible(
      { timeout: 20_000 },
    );
    await expect(page.getByText("Building", { exact: true })).toHaveCount(0);
    await expect(page.getByText("v1 · 12 credits")).toBeVisible();
    await expect(page.getByTitle("Site preview")).toBeAttached();
    await expect(page.getByLabel("Preview URL")).toHaveValue(
      `${previewHost}/terms`,
    );

    await page.getByRole("tab", { name: "Code" }).click();
    await expect(page).toHaveURL(/view=code/);
    await expect(
      page.getByRole("tree", { name: "Project files" }),
    ).toBeVisible();
  } finally {
    await session.cleanup();
  }
});
