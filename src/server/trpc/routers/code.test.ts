// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TRPCContext } from "../init";
import { createCallerFactory } from "../init";

vi.mock("server-only", () => ({}));
const sandbox = vi.hoisted(() => ({
  apply: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/server/code/sandbox-edit", () => ({
  applyEditToSandbox: sandbox.apply,
}));
vi.mock("@/server/sandbox/workspace", () => ({
  writeVersionToSandbox: sandbox.write,
}));

import { draftId } from "@/server/code/ids";
import { fakeEditDb, readyVersion } from "@/server/code/fake-db";
import { codeRouter } from "./code";

const caller = createCallerFactory(codeRouter);
const files = { "app/page.tsx": "export default 1;", "app/layout.tsx": "x" };

let fake: ReturnType<typeof fakeEditDb>;
let pending = 0;
let owned = true;
let operation: string | null = null;
const project = () => ({
  id: "p1",
  userId: "user_1",
  sandboxId: "sbx_1",
  operationId: operation ? "op" : null,
  operationKind: operation,
  operationStartedAt: operation ? new Date() : null,
});

function context() {
  const tx = {
    $queryRaw: vi.fn(),
    project: {
      findFirst: vi.fn(async () => (owned ? project() : null)),
      update: vi.fn(),
    },
    message: {
      count: vi.fn(async () => pending),
      create: fake.db.message.create,
    },
    version: fake.db.version,
  };
  return {
    session: { user: { id: "user_1" } },
    db: {
      throttleWindow: { upsert: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    },
    tx,
  };
}

let ctx: ReturnType<typeof context>;
let api: ReturnType<typeof caller>;

beforeEach(() => {
  fake = fakeEditDb([readyVersion("p1", 1, files)]);
  pending = 0;
  owned = true;
  operation = null;
  sandbox.apply.mockReset().mockResolvedValue(true);
  sandbox.write.mockReset().mockResolvedValue({ written: true });
  ctx = context();
  api = caller(ctx as unknown as TRPCContext);
});

describe("code.write", () => {
  it("saves a draft and updates the running preview", async () => {
    await expect(
      api.write({
        projectId: "p1",
        path: "app/page.tsx",
        content: "export default 2;",
      }),
    ).resolves.toEqual({ changed: true, previewUpdated: true });
    expect(fake.versions.get(draftId("p1"))?.files["app/page.tsx"]).toBe(
      "export default 2;",
    );
    expect(sandbox.apply).toHaveBeenCalledWith("sbx_1", {
      kind: "write",
      path: "app/page.tsx",
      content: "export default 2;",
    });
  });

  it("is locked while an agent is building", async () => {
    pending = 1;
    await expect(
      api.write({ projectId: "p1", path: "app/page.tsx", content: "x" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.versions.has(draftId("p1"))).toBe(false);
    expect(sandbox.apply).not.toHaveBeenCalled();
  });

  it("is locked during an export or restore, and for projects the user doesn't own", async () => {
    operation = "EXPORT";
    await expect(
      api.write({ projectId: "p1", path: "app/page.tsx", content: "x" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    operation = null;
    owned = false;
    await expect(
      api.write({ projectId: "p1", path: "app/page.tsx", content: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("explains refused paths and content as a bad request, before touching anything", async () => {
    for (const input of [
      { path: "../x.ts", content: "x" },
      { path: ".env", content: "A=1" },
      { path: "package.json", content: "{ nope" },
    ]) {
      await expect(
        api.write({ projectId: "p1", ...input }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(fake.versions.has(draftId("p1"))).toBe(false);
    expect(sandbox.apply).not.toHaveBeenCalled();
  });

  it("still saves when the sandbox is gone or fails, and says the preview wasn't updated", async () => {
    sandbox.apply.mockResolvedValueOnce(false);
    await expect(
      api.write({ projectId: "p1", path: "app/page.tsx", content: "a" }),
    ).resolves.toEqual({ changed: true, previewUpdated: false });
    sandbox.apply.mockRejectedValueOnce(new Error("boom"));
    await expect(
      api.write({ projectId: "p1", path: "app/page.tsx", content: "b" }),
    ).resolves.toEqual({ changed: true, previewUpdated: false });
    expect(fake.versions.get(draftId("p1"))?.files["app/page.tsx"]).toBe("b");
  });

  it("an unchanged file doesn't touch the sandbox", async () => {
    await expect(
      api.write({
        projectId: "p1",
        path: "app/page.tsx",
        content: files["app/page.tsx"],
      }),
    ).resolves.toEqual({ changed: false, previewUpdated: false });
    expect(sandbox.apply).not.toHaveBeenCalled();
  });

  it("is rate limited per user and needs a session", async () => {
    ctx.db.throttleWindow.upsert.mockResolvedValue({ count: 100_000 });
    await expect(
      api.write({ projectId: "p1", path: "app/page.tsx", content: "x" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      caller({ session: null, db: {} } as unknown as TRPCContext).write({
        projectId: "p1",
        path: "a.ts",
        content: "x",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("code.remove, saveVersion and discard", () => {
  it("removes a file from the working copy and the sandbox", async () => {
    await expect(
      api.remove({ projectId: "p1", path: "app/layout.tsx" }),
    ).resolves.toEqual({ changed: true, previewUpdated: true });
    expect(sandbox.apply).toHaveBeenCalledWith("sbx_1", {
      kind: "remove",
      path: "app/layout.tsx",
    });
  });

  it("saves the edits as the next version for free", async () => {
    await api.write({
      projectId: "p1",
      path: "app/page.tsx",
      content: "edited",
    });
    await expect(api.saveVersion({ projectId: "p1" })).resolves.toEqual({
      number: 2,
    });
    expect(fake.versions.has(draftId("p1"))).toBe(false);
    expect(
      [...fake.versions.values()].find((row) => row.number === 2),
    ).toMatchObject({ creditCost: 0 });
    await expect(api.saveVersion({ projectId: "p1" })).resolves.toEqual({
      number: null,
    });
  });

  it("discarding drops the draft and puts the saved files back in the sandbox", async () => {
    await api.write({
      projectId: "p1",
      path: "app/page.tsx",
      content: "edited",
    });
    await expect(api.discard({ projectId: "p1" })).resolves.toEqual({
      discarded: true,
      previewUpdated: true,
    });
    expect(fake.versions.has(draftId("p1"))).toBe(false);
    expect(sandbox.write).toHaveBeenCalledWith("sbx_1", files, {
      installInBackground: true,
    });
    await expect(api.discard({ projectId: "p1" })).resolves.toMatchObject({
      discarded: false,
    });
  });

  it("saving and discarding are locked while an agent is building", async () => {
    await api.write({
      projectId: "p1",
      path: "app/page.tsx",
      content: "edited",
    });
    pending = 1;
    await expect(api.saveVersion({ projectId: "p1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(api.discard({ projectId: "p1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
