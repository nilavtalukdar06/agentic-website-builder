import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

type Session = Awaited<ReturnType<typeof createTestSession>>;

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

let session: Session;
let suffix: string;
let wakeCalls: number;
const previewHost = `localhost:${process.env.E2E_PORT ?? 3000}`;

async function stubWake(page: Page, result: "ready" | "fail") {
  await page.route("**/api/trpc/**", async (route) => {
    const url = route.request().url();
    if (!url.includes("sandbox.wake")) return route.fallback();
    wakeCalls++;
    if (result === "fail") {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify([
          {
            error: {
              json: {
                message: "Couldn't wake the preview. Try again.",
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
              },
            },
          },
        ]),
      });
    }
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

async function seedBuiltProject() {
  const slug = `ws-${suffix}`;
  const projectId = await session.addProject({ slug, name: "Ember & Oak" });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Build a landing page for Ember & Oak",
    startedAt: new Date(Date.now() - 120_000),
    createdAt: new Date(Date.now() - 120_000),
  });
  await session.addMessage({
    id: `run_r1${suffix}_reply`,
    projectId,
    role: "ASSISTANT",
    content: "Ember & Oak is running in your sandbox.",
    replyToId: prompt,
    createdAt: new Date(Date.now() - 100_000),
    parts: [
      { type: "reasoning", text: "Plan the hero first.", durationMs: 4000 },
      {
        type: "task",
        title: "Built Ember & Oak",
        items: [
          {
            kind: "sandbox",
            label: "Created sandbox from the Next.js template",
          },
          { kind: "install", packages: ["motion"] },
          { kind: "file", verb: "created", path: "app/page.tsx", lines: 3 },
        ],
      },
      {
        type: "tool",
        callId: "c1",
        name: "terminal",
        command: "npm run lint",
        output: "No problems",
        exitCode: 0,
      },
      {
        type: "sources",
        sources: [
          { title: "Stripe Pricing", url: "https://stripe.com/pricing" },
        ],
      },
      { type: "text", text: "Ember & Oak is running in your sandbox." },
    ],
  });
  await session.addVersion({
    projectId,
    number: 1,
    title: "First version",
    runId: `r1${suffix}`,
    creditCost: 42,
    files: {
      "app/page.tsx": "export default function Page() {\n  return null;\n}\n",
      "app/layout.tsx": "export default function Layout() {}\n",
      "public/dot.png":
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    },
    createdAt: new Date(Date.now() - 100_000),
  });
  const second = await session.addMessage({
    projectId,
    role: "USER",
    content: "Add a footer",
    startedAt: new Date(Date.now() - 60_000),
    createdAt: new Date(Date.now() - 60_000),
  });
  await session.addMessage({
    id: `run_r2${suffix}_reply`,
    projectId,
    role: "ASSISTANT",
    content: "Added a footer.",
    replyToId: second,
    createdAt: new Date(Date.now() - 40_000),
    parts: [{ type: "text", text: "Added a footer." }],
  });
  await session.addVersion({
    projectId,
    number: 2,
    title: "Added a footer",
    runId: `r2${suffix}`,
    creditCost: 7,
    files: {
      "app/page.tsx":
        'import { Footer } from "@/components/footer";\nexport default function Page() {\n  return <Footer />;\n}\n',
      "app/layout.tsx": "export default function Layout() {}\n",
      "components/footer.tsx":
        "export function Footer() {\n  return null;\n}\n",
      "public/dot.png":
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    },
    createdAt: new Date(Date.now() - 40_000),
  });
  return { slug, projectId };
}

test.beforeEach(async ({ context }) => {
  session = await createTestSession("E2E Workspace");
  suffix = randomUUID().slice(0, 8);
  wakeCalls = 0;
  await context.addCookies([session.cookie]);
});

test.afterEach(async () => {
  await session.cleanup();
});

test("the chat shows the build, sources, versions and actions", async ({
  page,
}) => {
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);

  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Build a landing page for Ember & Oak"),
  ).toBeVisible();
  await expect(page.getByText("Built Ember & Oak · 1 file")).toBeVisible();
  await expect(page.getByText("Used 1 source")).toBeVisible();
  await expect(page.getByText("v1 · 42 credits")).toBeVisible();
  await expect(page.getByText("v2 · 7 credits")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore version 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Current version" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(1);

  await expect(page.getByRole("button", { name: "Good response" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Bad response" })).toHaveCount(
    0,
  );
});

test("the preview wakes the sandbox and switches devices through the URL", async ({
  page,
}) => {
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);

  await expect(page.getByTitle("Site preview")).toBeAttached();
  expect(wakeCalls).toBeGreaterThan(0);
  await expect(page.getByLabel("Preview URL")).toHaveValue(
    `${previewHost}/terms`,
  );
  await page.getByRole("button", { name: "Device: Desktop" }).click();
  await page.getByRole("menuitemradio", { name: "Mobile" }).click();
  await expect(page).toHaveURL(/device=mobile/);
  await expect(
    page.getByRole("button", { name: "Device: Mobile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Console/ }).click();
  await expect(page.getByText("$ npm run lint")).toBeVisible();
});

test("a preview that can't wake shows an error with retry", async ({
  page,
}) => {
  await stubWake(page, "fail");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);
  await expect(
    page.getByText("Couldn't wake the preview", { exact: true }),
  ).toBeVisible();
  const before = wakeCalls;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => wakeCalls).toBeGreaterThan(before);
});

test("code mode browses files with markers, tabs and downloads", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}?view=code`);

  const tree = page.getByRole("tree", { name: "Project files" });
  await expect(tree).toBeVisible();
  await expect(tree.getByLabel("Modified")).toHaveCount(1);
  await expect(tree.getByLabel("Added")).toHaveCount(1);
  await expect(page.getByText("Version 2 · Added a footer")).toBeVisible();
  await expect(page.getByText("export default function Page()")).toBeVisible();

  await tree.getByText("footer.tsx").click();
  await expect(page).toHaveURL(/file=components(%2F|\/)footer\.tsx/);
  await expect(page.getByRole("tab", { name: /footer\.tsx/ })).toBeVisible();
  await expect(page.getByText("export function Footer()")).toBeVisible();

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download components/footer.tsx" })
    .click();
  expect((await download).suggestedFilename()).toBe("footer.tsx");

  const zip = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project as ZIP" }).click();
  expect((await zip).suggestedFilename()).toBe(`${slug}-v2.zip`);

  await tree.getByText("dot.png").click();
  await expect(page.getByRole("img", { name: "public/dot.png" })).toBeVisible();

  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page).not.toHaveURL(/view=code/);
  expect(
    problems.filter(
      (text) => !/Failed to load resource|allow-presentation/.test(text),
    ),
  ).toEqual([]);
});

test("restoring a version saves it as the newest one", async ({ page }) => {
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);
  await page.getByRole("button", { name: "Restore version 1" }).click();
  await expect(page.getByText("Restored version 1 as version 3.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("v3", { exact: true })).toBeVisible();
  await expect(page.getByText("v3 · 0 credits")).toBeVisible();
});

test("a building project shows the overlay and stops a queued prompt", async ({
  page,
}) => {
  await stubWake(page, "ready");
  const projectId = await session.addProject({
    slug: `build-${suffix}`,
    name: "Queued site",
  });
  await session.addMessage({
    projectId,
    role: "USER",
    content: "Build a bakery site",
  });
  await page.goto(`/p/build-${suffix}`);

  await expect(page.getByText("Building", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Preview loads after the first compile"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Export to GitHub/ }),
  ).toBeDisabled();
  expect(wakeCalls).toBe(0);

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(
    page.getByText("Stopped before I started. Nothing was changed."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Building", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No preview yet")).toBeVisible();
});

test("a follow-up is queued, then stopped", async ({ page }) => {
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);

  const input = page.getByRole("textbox", { name: "Message Vibe" });
  const send = page.getByRole("button", { name: "Send message" });
  await expect(async () => {
    await input.fill("Make the hero darker");
    await expect(send).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await send.click();

  await expect(
    page.getByRole("log").getByText("Make the hero darker"),
  ).toBeVisible({ timeout: 20_000 });
  const stop = page.getByRole("button", { name: "Stop" });
  if (await stop.isVisible()) await stop.click();
  await expect(
    page
      .getByText("Stopped before I started. Nothing was changed.")
      .or(page.getByText(/You're out of credits/)),
  ).toBeVisible({ timeout: 20_000 });
});

test("the header switcher and the composer are labelled", async ({ page }) => {
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);
  await expect(
    page.getByRole("textbox", { name: "Message Vibe" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ember & Oak. Switch project" }),
  ).toBeVisible();
});

test("an older version opens in code mode from its card and from history", async ({
  page,
}) => {
  await stubWake(page, "ready");
  const { slug } = await seedBuiltProject();
  await page.goto(`/p/${slug}`);

  await page.getByRole("button", { name: "View code of version 1" }).click();
  await expect(page).toHaveURL(/view=code/);
  await expect(page).toHaveURL(/version=1/);
  await expect(
    page.getByText("Viewing version 1 · First version"),
  ).toBeVisible();
  await expect(page.getByText("export default function Page()")).toBeVisible();
  await expect(page.getByRole("tree").getByText("footer.tsx")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to latest" }).click();
  await expect(page).not.toHaveURL(/version=/);
  await expect(page.getByRole("tree").getByText("footer.tsx")).toBeVisible();

  await page.getByRole("button", { name: "Version history" }).click();
  await page.getByRole("menuitem", { name: /v1/ }).hover();
  await page.getByRole("menuitem", { name: "View code" }).click();
  await expect(page).toHaveURL(/version=1/);
});

test("a reply saved while the page is open appears without a reload", async ({
  page,
}) => {
  await stubWake(page, "ready");
  const projectId = await session.addProject({
    slug: `wait-${suffix}`,
    name: "Waiting site",
  });
  const prompt = await session.addMessage({
    projectId,
    role: "USER",
    content: "Build a florist site",
    startedAt: new Date(),
  });
  await page.goto(`/p/wait-${suffix}`);
  await expect(page.getByText("Building", { exact: true })).toBeVisible();

  await session.addMessage({
    projectId,
    role: "ASSISTANT",
    content: "I've built the florist site.",
    replyToId: prompt,
    parts: [{ type: "text", text: "I've built the florist site." }],
  });

  await expect(page.getByText("I've built the florist site.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Building", { exact: true })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the chat and the preview are separate full-screen views", async ({
    page,
  }) => {
    await stubWake(page, "ready");
    const { slug } = await seedBuiltProject();
    await page.goto(`/p/${slug}`);

    await expect(
      page.getByText("Build a landing page for Ember & Oak"),
    ).toBeVisible();
    await expect(page.getByLabel("Message Vibe")).toBeVisible();
    await expect(page.getByTitle("Site preview")).toBeHidden();

    await page.getByRole("button", { name: "Show preview" }).click();
    await expect(page.getByTitle("Site preview")).toBeVisible();
    await expect(
      page.getByText("Build a landing page for Ember & Oak"),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: /Export/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await page.getByRole("button", { name: "More actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Open in new tab" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Code" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto(`/p/${slug}?view=code`);
    await page.getByRole("button", { name: "Show preview" }).click();
    await expect(page.getByTitle("Site preview")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Code" })).toHaveCount(0);

    await page.getByRole("button", { name: "Chat" }).click();
    await expect(
      page.getByRole("button", { name: /View code of version/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Build a landing page for Ember & Oak"),
    ).toBeVisible();
  });
});
