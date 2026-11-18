import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TRPCContext } from "../init";
import { createCallerFactory } from "../init";

vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/memory", async () => {
  const { userNamespace, projectNamespace } =
    await import("@/server/memory/scopes");
  const tag = "0123456789abcdef";
  return {
    memoryProvider: () => fake.current,
    memoryScopes: (userId: string) => ({
      userNs: userNamespace(userId, tag),
      projectNs: (id: string) => projectNamespace(id, tag),
    }),
  };
});
import { fakeMemoryProvider } from "@/server/memory/fake";
import { memoryRouter } from "./memory";

const caller = createCallerFactory(memoryRouter);
const userNs = "vibe:0123456789abcdef:u:user_1";
const db = {
  throttleWindow: { upsert: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  project: { findFirst: vi.fn(), findMany: vi.fn() },
};
const signedIn = caller({
  session: { user: { id: "user_1" } },
  db,
} as unknown as TRPCContext);

let memory: ReturnType<typeof fakeMemoryProvider>;
beforeEach(() => {
  memory = fakeMemoryProvider({
    [userNs]: { static: ["Prefers dark minimal designs"] },
  });
  fake.current = memory.provider;
  db.throttleWindow.upsert.mockReset().mockResolvedValue({ count: 1 });
  db.user.findUnique.mockReset().mockResolvedValue({ memoryEnabled: true });
  db.user.update.mockReset().mockResolvedValue({});
  db.project.findFirst.mockReset().mockResolvedValue(null);
  db.project.findMany.mockReset().mockResolvedValue([{ id: "p1" }]);
});

describe("memory router", () => {
  it("lists only the signed-in user's memories", async () => {
    const result = await signedIn.list();
    expect(result).toMatchObject({ configured: true, enabled: true });
    expect(result.items.map((item) => item.memory)).toEqual([
      "Prefers dark minimal designs",
    ]);
    expect(memory.calls[0]).toMatchObject({
      method: "profile",
      namespace: userNs,
    });
  });

  it("reports when memory isn't configured", async () => {
    fake.current = null;
    await expect(signedIn.list()).resolves.toEqual({
      configured: false,
      enabled: false,
      items: [],
    });
    await expect(signedIn.clear()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("turns memory on and off for the session user", async () => {
    await signedIn.setEnabled({ enabled: false });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { memoryEnabled: false },
    });
  });

  it("forgets project memories only in a project the user owns", async () => {
    await expect(
      signedIn.forget({ projectId: "someone_else", projectIds: ["m1"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.project.findFirst.mock.calls[0][0].where).toEqual({
      id: "someone_else",
      userId: "user_1",
    });
    await expect(signedIn.forget({ projectIds: ["m1"] })).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    );
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    await signedIn.forget({
      projectId: "p1",
      projectIds: ["m1"],
      userIds: ["u1"],
    });
    expect(
      memory.calls
        .filter((call) => call.method === "forget")
        .map((call) => call.namespace),
    ).toEqual(["vibe:0123456789abcdef:p:p1", userNs]);
  });

  it("clear drops the user's namespace and every owned project namespace", async () => {
    await signedIn.clear();
    expect(
      memory.calls
        .filter((call) => call.method === "dropNamespace")
        .map((call) => call.namespace),
    ).toEqual([userNs, "vibe:0123456789abcdef:p:p1"]);
  });

  it("is rate limited and needs a session", async () => {
    db.throttleWindow.upsert.mockResolvedValue({ count: 999 });
    await expect(signedIn.setEnabled({ enabled: true })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    await expect(
      caller({ session: null, db: {} } as unknown as TRPCContext).list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
