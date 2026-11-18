import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createTestSession } from "./fixtures/session";

test.skip(
  !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET,
  "needs the database and auth env",
);

test("message endpoint rejects foreign screenshot keys after authorizing the project", async ({
  context,
  request,
}) => {
  const session = await createTestSession("E2E Screenshot Reader");
  try {
    const projectId = await session.addProject({
      slug: `screenshots-${randomUUID()}`,
      name: "Screenshot retention",
    });
    await session.addMessage({
      projectId,
      role: "ASSISTANT",
      content: "Checks complete",
      parts: [
        {
          type: "browser",
          status: "passed",
          reason: null,
          checks: [],
          screenshots: [
            {
              viewport: "desktop",
              key: "qa/another-project/run1/0-desktop.png",
              url: "https://untrusted.test/shot.png",
            },
            { viewport: "phone", key: `qa/${projectId}/../0-phone.png` },
          ],
        },
      ],
    });
    const params = { input: JSON.stringify({ json: { projectId } }) };
    const signedOut = await request.get("/api/trpc/message.list", { params });
    expect(signedOut.status()).toBe(401);
    await context.addCookies([session.cookie]);
    const response = await context.request.get("/api/trpc/message.list", {
      params,
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(
      body.result.data.json.messages[0].parts[0].screenshots.map(
        (shot: { url: string | null }) => shot.url,
      ),
    ).toEqual([null, null]);
    const foreign = await context.request.get("/api/trpc/message.list", {
      params: { input: JSON.stringify({ json: { projectId: randomUUID() } }) },
    });
    expect(foreign.status()).toBe(404);
  } finally {
    await session.cleanup();
  }
});
