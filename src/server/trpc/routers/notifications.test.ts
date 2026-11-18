// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TRPCContext } from "../init";
import { createCallerFactory } from "../init";

vi.mock("server-only", () => ({}));
const availability = vi.hoisted(() => ({
  current: { enabled: true } as { enabled: boolean },
}));
vi.mock("@/server/email", () => ({
  emailAvailability: () => availability.current,
}));
import { notificationsRouter } from "./notifications";

const caller = createCallerFactory(notificationsRouter);
const db = {
  throttleWindow: { upsert: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
};
const signedIn = caller({
  session: { user: { id: "user_1" } },
  db,
} as unknown as TRPCContext);

beforeEach(() => {
  availability.current = { enabled: true };
  db.throttleWindow.upsert.mockReset().mockResolvedValue({ count: 1 });
  db.user.findUnique
    .mockReset()
    .mockResolvedValue({ email: "owner@example.com", notifyEmail: true });
  db.user.update.mockReset().mockResolvedValue({});
});

describe("notifications router", () => {
  it("reads only the signed-in user's setting", async () => {
    const result = await signedIn.get();
    expect(result).toMatchObject({
      configured: true,
      enabled: true,
      email: "owner@example.com",
      limited: true,
    });
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({
      id: "user_1",
    });
  });

  it("says when emails aren't set up on this server", async () => {
    availability.current = { enabled: false };
    await expect(signedIn.get()).resolves.toMatchObject({ configured: false });
  });

  it("turns notifications off and on for the session user", async () => {
    await signedIn.setEnabled({ enabled: false });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { notifyEmail: false },
    });
  });

  it("is rate limited and needs a session", async () => {
    db.throttleWindow.upsert.mockResolvedValue({ count: 999 });
    await expect(signedIn.setEnabled({ enabled: true })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    await expect(
      caller({ session: null, db: {} } as unknown as TRPCContext).get(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
