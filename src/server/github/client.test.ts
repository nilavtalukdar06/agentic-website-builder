// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), token: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  db: { account: { findFirst: mocks.account } },
}));
vi.mock("@/server/auth", () => ({
  auth: { api: { getAccessToken: mocks.token } },
}));
import { githubClient } from "./client";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({
    id: "better-auth-record-id",
    scope: "repo",
  });
  mocks.token.mockResolvedValue({ accessToken: "test-oauth-credential" });
});
test("decrypts through Better Auth 1.7 with the account record id and owning user", async () => {
  const client = await githubClient("user1", true);
  expect(mocks.token).toHaveBeenCalledWith({
    body: { accountId: "better-auth-record-id", userId: "user1" },
  });
  expect(client).toHaveProperty("rest.git.createCommit");
});
test("insufficient scope never requests a decrypted credential", async () => {
  mocks.account.mockResolvedValue({ id: "a1", scope: "public_repo" });
  await expect(githubClient("user1", true)).rejects.toMatchObject({
    code: "AUTH_REQUIRED",
  });
  expect(mocks.token).not.toHaveBeenCalled();
});
test("credential failures have safe retry guidance", async () => {
  mocks.token.mockRejectedValue(new Error("secret-in-provider-error"));
  await expect(githubClient("user1", true)).rejects.toThrow(
    "Connect GitHub and allow repository access",
  );
});
