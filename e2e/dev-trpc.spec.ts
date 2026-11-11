import "dotenv/config";
import { expect, test } from "@playwright/test";

test.skip(!process.env.DATABASE_URL, "needs a seeded database");

test("seeded project is server-rendered and refetches on the client", async ({
  page,
}) => {
  const response = await page.goto("/dev/trpc/demo-landing");
  expect(await response?.text()).toContain("Demo landing page");

  await expect(
    page.getByRole("heading", { name: "demo-landing" }),
  ).toBeVisible();
  await expect(page.getByTestId("project-card-skeleton")).toHaveCount(0);

  const updatedAt = page.getByTestId("updated-at");
  const before = await updatedAt.getAttribute("data-updated-at");
  const request = page.waitForRequest((req) => req.url().includes("/api/trpc"));
  await page.getByRole("button", { name: "Refetch" }).click();
  await request;
  await expect(updatedAt).not.toHaveAttribute("data-updated-at", before ?? "");
});

test("lists the seeded project", async ({ page }) => {
  await page.goto("/dev/trpc");
  await expect(page.getByText("Demo landing page")).toBeVisible();
  await page.getByRole("link", { name: /Demo landing page/ }).click();
  await expect(page).toHaveURL(/\/dev\/trpc\/demo-landing$/);
});

test("unknown slug shows the not-found state", async ({ page }) => {
  const response = await page.goto("/dev/trpc/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Project not found")).toBeVisible();
});
