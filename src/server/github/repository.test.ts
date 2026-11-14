// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { GithubClient } from "./client";
import { ensureRepository, pushCommit } from "./repository";
import { githubRequest } from "./errors";

const target = {
  repository: "owner/demo",
  repositoryUrl: "https://github.com/owner/demo",
  branch: "main",
  baseCommit: "base",
};
const repo = {
  full_name: target.repository,
  html_url: target.repositoryUrl,
  default_branch: "main",
  private: true,
  description: "Created with Vibe · export e1",
};
const api = {
  users: { getAuthenticated: vi.fn() },
  repos: {
    get: vi.fn(),
    createForAuthenticatedUser: vi.fn(),
    compareCommitsWithBasehead: vi.fn(),
  },
  git: { getRef: vi.fn(), updateRef: vi.fn() },
};
const client = { rest: api } as unknown as GithubClient;
beforeEach(() => {
  vi.resetAllMocks();
  api.users.getAuthenticated.mockResolvedValue({ data: { login: "owner" } });
  api.repos.get.mockResolvedValue({ data: repo });
  api.repos.createForAuthenticatedUser.mockResolvedValue({ data: repo });
  api.git.getRef.mockResolvedValue({ data: { object: { sha: "base" } } });
  api.git.updateRef.mockResolvedValue({});
});
describe("repository ownership and retry", () => {
  test("creates an initialized repository and captures its parent", async () => {
    api.repos.get.mockRejectedValueOnce({ status: 404 });
    await expect(
      ensureRepository(client, {
        id: "e1",
        name: "demo",
        private: true,
        existing: null,
      }),
    ).resolves.toEqual(target);
    expect(api.repos.createForAuthenticatedUser).toHaveBeenCalledWith({
      name: "demo",
      private: true,
      auto_init: true,
      description: repo.description,
    });
  });
  test("recovers creation whose response was lost without creating another repository", async () => {
    await expect(
      ensureRepository(client, {
        id: "e1",
        name: "demo",
        private: true,
        existing: null,
      }),
    ).resolves.toEqual(target);
    expect(api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });
  test("never adopts an unrelated name collision", async () => {
    api.repos.get.mockResolvedValue({
      data: { ...repo, description: "Someone else's repo" },
    });
    await expect(
      ensureRepository(client, {
        id: "e1",
        name: "demo",
        private: true,
        existing: null,
      }),
    ).rejects.toMatchObject({ code: "NAME_TAKEN" });
    expect(api.git.updateRef).not.toHaveBeenCalled();
  });
  test("re-export uses the stored repository and rejects unexpected visibility", async () => {
    await ensureRepository(client, {
      id: "e2",
      name: "ignored",
      private: true,
      existing: "owner/demo",
    });
    expect(api.repos.get).toHaveBeenCalledWith({
      owner: "owner",
      repo: "demo",
    });
    await expect(
      ensureRepository(client, {
        id: "e2",
        name: "demo",
        private: false,
        existing: "owner/demo",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
describe("branch updates", () => {
  test("fast-forwards without force", async () => {
    await pushCommit(client, { ...target, commitSha: "commit" });
    expect(api.git.updateRef).toHaveBeenCalledWith({
      owner: "owner",
      repo: "demo",
      ref: "heads/main",
      sha: "commit",
      force: false,
    });
  });
  test.each(["commit", "descendant"])(
    "does not push a duplicate after %s",
    async (head) => {
      api.git.getRef.mockResolvedValue({ data: { object: { sha: head } } });
      api.repos.compareCommitsWithBasehead.mockResolvedValue({
        data: { status: "ahead" },
      });
      await pushCommit(client, { ...target, commitSha: "commit" });
      expect(api.git.updateRef).not.toHaveBeenCalled();
    },
  );
  test("refuses an external branch change", async () => {
    api.git.getRef.mockResolvedValue({ data: { object: { sha: "external" } } });
    api.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: { status: "diverged" },
    });
    await expect(
      pushCommit(client, { ...target, commitSha: "commit" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(api.git.updateRef).not.toHaveBeenCalled();
  });
});
test("GitHub transport failures cannot leak request credentials", async () => {
  const token = "sensitive-test-token";
  await expect(
    githubRequest(async () => {
      throw new Error(token);
    }),
  ).rejects.toThrow("GitHub is temporarily unavailable");
  try {
    await githubRequest(async () => {
      throw { status: 401, request: { headers: { authorization: token } } };
    });
  } catch (error) {
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(JSON.stringify(error)).not.toContain(token);
  }
});

test("rate limits remain transient instead of asking for OAuth again", async () => {
  await expect(
    githubRequest(async () => {
      throw {
        status: 403,
        response: { headers: { "x-ratelimit-remaining": "0" } },
      };
    }),
  ).rejects.toThrow("GitHub is temporarily unavailable");
});
