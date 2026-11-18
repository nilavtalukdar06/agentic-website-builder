// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/server/sandbox/workspace", () => ({
  wakeSandbox: vi.fn(),
  writeVersionToSandbox: vi.fn(),
}));
vi.mock("@/inngest/publisher", () => ({ createPublisher: () => vi.fn() }));
vi.mock("@/server/storage/attachments", () => ({
  attachmentUrl: vi.fn(),
  deleteAttachment: vi.fn(),
}));
vi.mock("@/server/sandbox/admin", () => ({ killSandbox: vi.fn() }));
vi.mock("@/server/ai/gateway", () => ({
  findAgentModel: vi.fn(),
  getAgentModels: vi.fn(),
  pickDefaultModel: vi.fn(),
}));
vi.mock("@/server/billing/payments", () => ({
  stripeProvider: () => ({ createCheckout: vi.fn() }),
}));

const { appRouter, createCaller } = await import("./_app");
type Context = Parameters<typeof createCaller>[0];

const paths = Object.keys(appRouter._def.procedures);

function call(caller: unknown, path: string, input: unknown) {
  const target = path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown>)[key],
      caller,
    );
  return (target as (input: unknown) => Promise<unknown>)(input);
}

function procedureType(path: string) {
  const procedure = (
    appRouter._def.procedures as unknown as Record<
      string,
      { _def: { type: string; inputs: unknown[] } }
    >
  )[path];
  return procedure._def;
}

const signedOut = createCaller({
  session: null,
  db: {},
} as unknown as Context);

describe("tRPC surface", () => {
  test("has procedures to audit", () => {
    expect(paths.length).toBeGreaterThan(15);
  });

  test.each(paths)("%s rejects signed-out callers", async (path) => {
    await expect(call(signedOut, path, {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("every procedure that takes data validates it with a schema", () => {
    const withoutInput = paths
      .filter((path) => procedureType(path).inputs.length === 0)
      .sort();
    expect(withoutInput).toEqual([
      "credits.balance",
      "memory.clear",
      "memory.list",
      "model.list",
      "notifications.get",
    ]);
  });

  test("the expensive mutations are rate limited per user", async () => {
    const exhausted = createCaller({
      session: { user: { id: "u1" } },
      db: {
        throttleWindow: { upsert: vi.fn().mockResolvedValue({ count: 1e6 }) },
      },
    } as unknown as Context);
    const limited: string[] = [];
    for (const path of paths) {
      if (procedureType(path).type !== "mutation") continue;
      const error = await call(exhausted, path, {}).catch((e: unknown) => e);
      if ((error as { code?: string }).code === "TOO_MANY_REQUESTS") {
        limited.push(path);
      }
    }
    expect(limited.sort()).toEqual([
      "credits.checkout",
      "github.retry",
      "github.start",
      "memory.clear",
      "memory.forget",
      "memory.setEnabled",
      "message.retry",
      "message.send",
      "notifications.setEnabled",
      "project.create",
      "project.delete",
      "sandbox.wake",
      "version.restore",
    ]);
  });
});
