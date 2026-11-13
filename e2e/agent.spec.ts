import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

type Session = Awaited<ReturnType<typeof createTestSession>>;

test.describe("realtime token endpoint", () => {
  test("rejects signed-out callers", async ({ request }) => {
    const response = await request.post("/api/realtime/token", {
      data: { projectId: "anything" },
    });
    expect(response.status()).toBe(401);
  });

  test("attachment uploads reject signed-out callers", async ({ request }) => {
    const response = await request.post("/api/attachments", {
      multipart: {
        file: {
          name: "a.png",
          mimeType: "image/png",
          buffer: Buffer.from("x"),
        },
      },
    });
    expect(response.status()).toBe(401);
  });

  test("answering a question and setting a secret reject signed-out callers", async ({
    request,
  }) => {
    const answer = await request.post("/api/inputs/anything", {
      data: { text: "x" },
    });
    expect(answer.status()).toBe(401);
    expect(answer.headers()["cache-control"]).toBe("no-store");
    const secret = await request.put("/api/projects/anything/secrets", {
      data: { name: "OPENAI_API_KEY", value: "sk-test" },
    });
    expect(secret.status()).toBe(401);
  });
});

test.describe("with a session", () => {
  test.skip(
    !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
    "needs the database and auth env",
  );

  let session: Session;
  let suffix: string;

  test.beforeEach(async ({ context }) => {
    session = await createTestSession("E2E Agent");
    suffix = randomUUID().slice(0, 8);
    await context.addCookies([session.cookie]);
  });

  test.afterEach(async () => {
    await session.cleanup();
  });

  test("token endpoint validates input and ownership", async ({ page }) => {
    const invalid = await page.request.post("/api/realtime/token", {
      data: {},
    });
    expect(invalid.status()).toBe(400);
    const missing = await page.request.post("/api/realtime/token", {
      data: { projectId: `missing-${suffix}` },
    });
    expect(missing.status()).toBe(404);
  });

  test("the composer picks a model and attaches images", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Public|Next\.js/ }),
    ).toHaveCount(0);
    const chip = page.getByRole("button", {
      name: /^Model: .+\. Change model$/,
    });
    await expect(chip).toBeVisible();
    await expect(chip.locator('[data-slot="model-logo"]')).toBeVisible();
    await chip.click();
    const dialog = page.getByRole("dialog", { name: "Choose a model" });
    await expect(dialog.getByPlaceholder("Search models…")).toBeVisible();
    const options = dialog.getByRole("option");
    const total = await options.count();
    await expect(dialog.locator('[data-slot="model-logo"]')).toHaveCount(total);
    await dialog.getByPlaceholder("Search models…").fill("codex");
    const option = options.first();
    await expect(option.locator('[data-slot="model-logo"]')).toHaveAttribute(
      "data-logo",
      "codex",
    );
    const name = (await option.textContent())?.split("$")[0].trim() ?? "";
    await option.click();
    await expect(
      page.getByRole("button", { name: `Model: ${name}. Change model` }),
    ).toBeVisible();

    await page.getByLabel("Upload files").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(
      page.getByText("Only PNG, JPEG, WebP and GIF images can be attached."),
    ).toBeVisible();

    await page.getByLabel("Upload files").setInputFiles({
      name: "reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.getByText("reference.png")).toBeVisible();
    await page.getByRole("button", { name: "Remove reference.png" }).click();
    await expect(page.getByText("reference.png")).toHaveCount(0);
  });

  test("the composer switches between Standard and Fast mode", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("combobox", {
      name: "Mode: Standard. Change mode",
    });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(
      page.getByRole("option", { name: /Standard.*team of agents/ }),
    ).toBeVisible();
    const popup = page.locator('[data-slot="select-content"]');
    expect(
      await popup.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.getByRole("option", { name: /Fast.*builder alone/ }).click();
    await expect(
      page.getByRole("combobox", { name: "Mode: Fast. Change mode" }),
    ).toHaveText(/Fast/);
    const opacity = await page
      .locator('form [data-slot="input-group"]')
      .evaluate((group) => getComputedStyle(group).opacity);
    expect(opacity).toBe("1");
  });

  test("the microphone works where the browser supports speech recognition", async ({
    page,
  }) => {
    await page.goto("/");
    const supported = await page.evaluate(
      () =>
        "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    );
    const mic = page.getByRole("button", { name: "Dictate" });
    await expect(mic).toBeVisible();
    if (supported) {
      await expect(mic).toBeEnabled();
      await expect(mic).toHaveAttribute("aria-pressed", "false");
    } else {
      await expect(mic).toBeDisabled();
      await expect(mic).toHaveAttribute("aria-disabled", "true");
    }
  });

  test("a disabled control doesn't fade the whole composer", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SpeechRecognition", { value: undefined });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        value: undefined,
      });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Dictate" })).toBeDisabled();
    const opacity = await page
      .locator('form [data-slot="input-group"]')
      .evaluate((group) => getComputedStyle(group).opacity);
    expect(opacity).toBe("1");
  });

  test("a finished run shows the reply and the preview link", async ({
    page,
  }) => {
    const projectId = await session.addProject({
      slug: `done-${suffix}`,
      name: "Done site",
      previewUrl: "https://3000-sbx-e2e.e2b.app",
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Build a coffee site",
      createdAt: new Date(Date.now() - 60_000),
    });
    await session.addMessage({
      projectId,
      role: "ASSISTANT",
      content: "Built a hero and a roast grid.",
      parts: [{ type: "text", text: "Built a hero and a roast grid." }],
    });

    await page.goto(`/p/done-${suffix}`);
    await expect(page.getByText("Built by the agent")).toBeVisible();
    await expect(
      page.getByText("Built a hero and a roast grid."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open preview" }),
    ).toHaveAttribute("href", "https://3000-sbx-e2e.e2b.app");
  });

  test("a failed run says the agent stopped", async ({ page }) => {
    const projectId = await session.addProject({
      slug: `failed-${suffix}`,
      name: "Failed site",
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Build a coffee site",
      createdAt: new Date(Date.now() - 60_000),
    });
    await session.addMessage({
      projectId,
      role: "ASSISTANT",
      content: "You're out of credits.",
      parts: [{ type: "error", message: "You're out of credits." }],
    });

    await page.goto(`/p/failed-${suffix}`);
    await expect(page.getByText("The agent stopped")).toBeVisible();
    await expect(page.getByText("You're out of credits.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Refresh" })).toHaveCount(0);
  });

  test("questions can only be answered by their owner, with a valid body", async ({
    page,
  }) => {
    const missing = await page.request.post(`/api/inputs/missing-${suffix}`, {
      data: { text: "x" },
    });
    expect(missing.status()).toBe(404);

    const projectId = await session.addProject({
      slug: `ask-${suffix}`,
      name: "Ask site",
    });
    const id = await session.addInputRequest({
      projectId,
      kind: "CHOICE",
      status: "ANSWERED",
      payload: {
        request: {
          kind: "choice",
          question: "Which provider?",
          options: ["Gemini", "Gateway"],
        },
      },
    });
    const answered = await page.request.post(`/api/inputs/${id}`, {
      data: { selected: ["Gemini"] },
    });
    expect(answered.status()).toBe(409);

    const secrets = await page.request.put(
      `/api/projects/missing-${suffix}/secrets`,
      { data: { name: "OPENAI_API_KEY", value: "sk-test" } },
    );
    expect(secrets.status()).toBe(404);
    const invalid = await page.request.put(
      `/api/projects/${projectId}/secrets`,
      {
        data: { name: "PATH", value: "x" },
      },
    );
    expect(invalid.status()).toBe(400);
  });

  test("a paused run shows the question it is waiting on", async ({ page }) => {
    const projectId = await session.addProject({
      slug: `paused-${suffix}`,
      name: "Paused site",
    });
    await session.addMessage({
      projectId,
      role: "USER",
      content: "Add an AI chat to the site",
      createdAt: new Date(Date.now() - 60_000),
    });
    await session.addMessage({
      projectId,
      role: "ASSISTANT",
      content:
        "I need your answer to continue. The question is waiting for you in this project.",
      parts: [],
    });
    const id = await session.addInputRequest({
      projectId,
      kind: "SECRET",
      payload: {
        request: {
          kind: "secret",
          name: "OPENAI_API_KEY",
          label: "OpenAI API key",
          reason: "For the chat feature",
        },
      },
    });

    await page.goto(`/p/paused-${suffix}`);
    await expect(page.getByText("Waiting for your answer")).toBeVisible();
    await expect(
      page.getByText(
        "The agent paused to ask: OpenAI API key (OPENAI_API_KEY)",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Refresh" })).toBeVisible();

    const invalid = await page.request.post(`/api/inputs/${id}`, {
      data: { value: "" },
    });
    expect(invalid.status()).toBe(400);
  });
});
