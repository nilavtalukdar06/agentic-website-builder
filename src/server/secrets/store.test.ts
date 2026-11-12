// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { encryptSecret } from "./crypto";
import { loadSecretValues, setSecret } from "./store";

function makeDb(existing: { id: string } | null) {
  const db = {
    projectSecret: {
      findUnique: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    secretEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
  return db;
}

describe("secret store", () => {
  test("stores ciphertext only and audits SET or REPLACED", async () => {
    const db = makeDb(null);
    await setSecret(db as never, {
      projectId: "p1",
      userId: "u1",
      name: "OPENAI_API_KEY",
      value: "sk-plain-value",
    });
    expect(JSON.stringify(db.projectSecret.upsert.mock.calls)).not.toContain(
      "sk-plain-value",
    );
    expect(db.secretEvent.create).toHaveBeenCalledWith({
      data: {
        projectId: "p1",
        userId: "u1",
        name: "OPENAI_API_KEY",
        action: "SET",
      },
    });

    const again = makeDb({ id: "s1" });
    await expect(
      setSecret(again as never, {
        projectId: "p1",
        userId: "u1",
        name: "OPENAI_API_KEY",
        value: "sk-new",
      }),
    ).resolves.toEqual({ name: "OPENAI_API_KEY", replaced: true });
    expect(again.secretEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "REPLACED" }),
    });
  });

  test("decrypts values and skips rows that fail to decrypt", async () => {
    const db = makeDb(null);
    const good = encryptSecret({
      projectId: "p1",
      name: "A_KEY",
      value: "v1-long",
    });
    db.projectSecret.findMany.mockResolvedValue([
      { projectId: "p1", name: "A_KEY", ...good },
      { projectId: "p1", name: "B_KEY", ...good },
    ]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadSecretValues(db as never, "p1", { touch: true }),
    ).resolves.toEqual([{ name: "A_KEY", value: "v1-long" }]);
    expect(db.projectSecret.updateMany).toHaveBeenCalled();
    expect(spy.mock.calls.flat().join(" ")).not.toContain("v1-long");
    spy.mockRestore();
  });
});
