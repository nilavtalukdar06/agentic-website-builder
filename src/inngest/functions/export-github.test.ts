// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  progress: vi.fn(),
  fail: vi.fn(),
  client: vi.fn(),
  ensure: vi.fn(),
  push: vi.fn(),
  recover: vi.fn(),
  write: vi.fn(),
  snapshot: vi.fn(),
  db: {
    project: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    version: { findFirst: vi.fn() },
    githubExport: { update: vi.fn() },
  },
  git: { createBlob: vi.fn(), createTree: vi.fn(), createCommit: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: mocks.db }));
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: (options: unknown, handler: unknown) => ({
      options,
      handler,
    }),
  },
}));
vi.mock("@/server/github/client", () => ({ githubClient: mocks.client }));
vi.mock("@/server/github/jobs", () => ({
  claimExport: mocks.claim,
  completeExport: mocks.complete,
  exportProgress: mocks.progress,
  failExport: mocks.fail,
}));
vi.mock("@/server/github/repository", async (original) => ({
  ...(await original<object>()),
  ensureRepository: mocks.ensure,
  pushCommit: mocks.push,
}));
vi.mock("@/server/sandbox/sandbox", () => ({
  getOrCreateSandbox: mocks.recover,
  previewUrlFor: () => "https://3000-new.e2b.app",
  snapshotForExport: mocks.snapshot,
  SnapshotLimitError: class extends Error {},
}));
vi.mock("@/server/sandbox/workspace", () => ({
  writeVersionToSandbox: mocks.write,
}));

const { exportGithub } = await import("./export-github");
const { ExportError } = await import("@/server/github/errors");
const worker = exportGithub as unknown as {
  options: { concurrency: object; onFailure: (args: object) => Promise<void> };
  handler: (args: object) => Promise<unknown>;
};
const request = {
  exportId: "e1",
  projectId: "p1",
  userId: "u1",
  attempt: 1,
  requestId: "e1:1",
};
const files = {
  "package.json": JSON.stringify({
    scripts: { dev: "next dev" },
    dependencies: { next: "16.4.6", react: "19.3.0" },
  }),
  "app/page.tsx":
    "export default function Page() { return <main>Demo</main>; }",
  "app/layout.tsx":
    "export default function Layout({children}) { return <html><body>{children}</body></html>; }",
};
const job = {
  id: "e1",
  projectId: "p1",
  userId: "u1",
  versionId: "v1",
  versionNumber: 2,
  private: true,
  name: "demo",
  createdAt: new Date("2026-11-14T00:00:00Z"),
  commitSha: null,
};
const target = {
  repository: "owner/demo",
  repositoryUrl: "https://github.com/owner/demo",
  branch: "main",
  baseCommit: "base",
};
function run(cache = new Map<string, unknown>()) {
  const results: unknown[] = [];
  const step = {
    run: vi.fn(async (name: string, callback: () => Promise<unknown>) => {
      if (cache.has(name)) return cache.get(name);
      const result = await callback();
      results.push(result);
      cache.set(name, result);
      return result;
    }),
  };
  return {
    step,
    results,
    promise: worker.handler({ event: { data: request }, runId: "run1", step }),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(job);
  mocks.db.project.findFirst.mockResolvedValue({
    sandboxId: "old",
    name: "Demo",
  });
  mocks.db.project.findUniqueOrThrow.mockResolvedValue({ githubRepo: null });
  mocks.db.project.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.version.findFirst.mockResolvedValue({ files });
  mocks.recover.mockResolvedValue({
    sandbox: { sandboxId: "old" },
    created: false,
  });
  mocks.write.mockResolvedValue({ written: true });
  mocks.snapshot.mockResolvedValue(files);
  mocks.ensure.mockResolvedValue(target);
  mocks.client.mockResolvedValue({
    auth: "never-serialize-this-token",
    rest: { git: mocks.git },
  });
  mocks.git.createBlob.mockResolvedValue({ data: { sha: "blob" } });
  mocks.git.createTree.mockResolvedValue({ data: { sha: "tree" } });
  mocks.git.createCommit.mockResolvedValue({ data: { sha: "commit" } });
});
describe("durable GitHub export", () => {
  test.each([false, true])(
    "exports the frozen saved version with replacement=%s",
    async (created) => {
      mocks.recover.mockImplementation(async (_id, restore) => {
        if (created) expect(await restore()).toEqual(files);
        return { sandbox: { sandboxId: created ? "new" : "old" }, created };
      });
      const execution = run();
      await expect(execution.promise).resolves.toMatchObject({
        status: "succeeded",
        commitSha: "commit",
      });
      expect(mocks.write).toHaveBeenCalledWith(created ? "new" : "old", files, {
        installInBackground: false,
      });
      expect(mocks.ensure).toHaveBeenCalledOnce();
      expect(mocks.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: ["base"],
          author: {
            name: "Vibe",
            email: "noreply@vibe.local",
            date: job.createdAt.toISOString(),
          },
        }),
      );
      expect(mocks.push.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.complete.mock.invocationCallOrder[0],
      );
      expect(JSON.stringify(execution.results)).not.toContain(
        "never-serialize-this-token",
      );
      expect(JSON.stringify(mocks.write.mock.calls)).not.toContain(
        "never-serialize-this-token",
      );
    },
  );
  test("duplicate event delivery does not recover or push", async () => {
    mocks.claim.mockResolvedValue(null);
    await expect(run().promise).resolves.toEqual({ status: "duplicate" });
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  test("a resumed push step reuses blobs and commit", async () => {
    const cache = new Map<string, unknown>();
    mocks.push.mockRejectedValueOnce(new Error("temporary push failure"));
    await expect(run(cache).promise).rejects.toThrow(
      "GitHub is temporarily unavailable",
    );
    expect(mocks.complete).not.toHaveBeenCalled();
    await run(cache).promise;
    expect(mocks.git.createCommit).toHaveBeenCalledOnce();
    expect(mocks.ensure).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledTimes(2);
  });
  test("an explicit retry reuses the persisted repository and commit", async () => {
    mocks.claim.mockResolvedValue({ ...job, ...target, commitSha: "saved" });
    await run().promise;
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.git.createCommit).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(expect.anything(), {
      ...target,
      commitSha: "saved",
    });
  });
  test.each(["missing", "failed", "secret"])(
    "refuses %s recovery before repository creation",
    async (kind) => {
      if (kind === "missing")
        mocks.db.version.findFirst.mockResolvedValue(null);
      if (kind === "failed") mocks.write.mockResolvedValue({ written: false });
      if (kind === "secret")
        mocks.db.version.findFirst.mockResolvedValue({
          files: {
            ...files,
            "token.ts": `const token = 'ghp_${"x1Y2z3".repeat(6)}';`,
          },
        });
      await expect(run().promise).rejects.toBeInstanceOf(ExportError);
      expect(mocks.ensure).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
    },
  );
  test("terminal failures release the reservation through the failure handler", async () => {
    const error = new ExportError("RECOVERY");
    await worker.options.onFailure({
      event: { data: { event: { data: request } } },
      error,
      step: { run: async (_name: string, fn: () => Promise<unknown>) => fn() },
    });
    expect(mocks.fail).toHaveBeenCalledWith(mocks.db, request, error);
    expect(worker.options.concurrency).toEqual({
      key: "event.data.projectId",
      limit: 1,
      scope: "env",
    });
  });
});
