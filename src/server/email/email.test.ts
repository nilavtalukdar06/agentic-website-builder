// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { allowanceFor, dayOf, emailAllowance, recordEmailSent } =
  await import("./budget");
const { EmailRetry, deliverNotification } = await import("./deliver");
const { fakeEmailProvider } = await import("./fake");
const { MIN_FINISH_MS, decideNotification } = await import("./notify");
const { classifyResendError } = await import("./resend");
const { renderNotification } = await import("./templates");

const base = {
  kind: "run-finished" as const,
  email: "owner@example.com",
  optedIn: true,
  durationMs: MIN_FINISH_MS + 1,
  canSendRoutine: true,
  canSendImportant: true,
};

describe("decideNotification", () => {
  test("a build that took a while sends", () => {
    expect(decideNotification(base)).toEqual({ send: true });
  });

  test("a quick build doesn't, because the user is probably still looking", () => {
    expect(decideNotification({ ...base, durationMs: 5_000 })).toEqual({
      send: false,
      reason: "too-fast",
    });
    expect(decideNotification({ ...base, durationMs: null })).toEqual({
      send: false,
      reason: "too-fast",
    });
  });

  test("failures and exports ignore the duration rule", () => {
    for (const kind of [
      "run-failed",
      "run-out-of-credits",
      "export-finished",
      "export-failed",
    ] as const) {
      expect(decideNotification({ ...base, kind, durationMs: 1 })).toEqual({
        send: true,
      });
    }
  });

  test("respects the opt-out and a missing address", () => {
    expect(decideNotification({ ...base, optedIn: false })).toEqual({
      send: false,
      reason: "opted-out",
    });
    expect(decideNotification({ ...base, email: null })).toEqual({
      send: false,
      reason: "no-email",
    });
  });

  test("routine emails stop first, failures keep going", () => {
    const tight = { canSendRoutine: false, canSendImportant: true };
    expect(decideNotification({ ...base, ...tight })).toEqual({
      send: false,
      reason: "budget",
    });
    expect(
      decideNotification({ ...base, ...tight, kind: "run-failed" }),
    ).toEqual({ send: true });
    expect(
      decideNotification({
        ...base,
        kind: "run-failed",
        canSendRoutine: false,
        canSendImportant: false,
      }),
    ).toEqual({ send: false, reason: "budget" });
  });
});

describe("renderNotification", () => {
  const content = {
    projectName: "Ember & Oak",
    projectUrl: "https://vibe.test/p/ember",
    usageUrl: "https://vibe.test/usage",
    settingsUrl: "https://vibe.test",
  };

  test("says what happened and links to the project, in html and plain text", () => {
    const mail = renderNotification({ ...content, kind: "run-finished" });
    expect(mail.subject).toBe("Ember & Oak is ready");
    expect(mail.html).toContain('<html lang="en">');
    expect(mail.html).toContain('href="https://vibe.test/p/ember"');
    expect(mail.text).toContain("Open the project: https://vibe.test/p/ember");
    expect(mail.text).toContain("Turn them off under Notifications");
  });

  test("a failure says it was free; out of credits points to the top-up page", () => {
    expect(
      renderNotification({ ...content, kind: "run-failed" }).text,
    ).toContain("You weren't charged");
    const credits = renderNotification({
      ...content,
      kind: "run-out-of-credits",
    });
    expect(credits.text).toContain("https://vibe.test/usage");
  });

  test("never lets a project name break the markup or the subject line", () => {
    const mail = renderNotification({
      ...content,
      kind: "run-finished",
      projectName:
        'x</h1><img src=x onerror="alert(1)">\r\nBcc: evil@example.com',
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain('onerror="alert');
    expect(mail.subject).not.toMatch(/[\r\n]/u);
    expect(mail.subject.length).toBeLessThan(120);
  });

  test("an export links to GitHub only for a real github.com repository", () => {
    const ok = renderNotification({
      ...content,
      kind: "export-finished",
      repositoryUrl: "https://github.com/acme/site",
    });
    expect(ok.text).toContain(
      "Open the repository: https://github.com/acme/site",
    );
    const bad = renderNotification({
      ...content,
      kind: "export-finished",
      repositoryUrl: "https://evil.example/phish",
    });
    expect(bad.text).not.toContain("evil.example");
    expect(bad.text).toContain("https://vibe.test/p/ember");
  });
});

describe("budget", () => {
  test("routine emails stop at 80% of the day's limit, failures at 100%", () => {
    expect(allowanceFor(79, 100)).toEqual({
      canSendRoutine: true,
      canSendImportant: true,
    });
    expect(allowanceFor(80, 100)).toEqual({
      canSendRoutine: false,
      canSendImportant: true,
    });
    expect(allowanceFor(100, 100)).toEqual({
      canSendRoutine: false,
      canSendImportant: false,
    });
    expect(dayOf(Date.UTC(2026, 10, 19, 23, 59))).toBe("2026-11-19");
  });

  test("alerts once when the day crosses 80%", async () => {
    let sent = 78;
    let alertedAt: Date | null = null;
    const db = {
      emailUsage: {
        findUnique: vi.fn(async () => ({ sent })),
        upsert: vi.fn(async () => {
          sent += 1;
          return { sent, alertedAt };
        }),
        updateMany: vi.fn(async () => {
          if (alertedAt) return { count: 0 };
          alertedAt = new Date();
          return { count: 1 };
        }),
      },
    };
    const alert = vi.fn().mockResolvedValue(undefined);
    await recordEmailSent(db as never, 100, alert);
    expect(alert).not.toHaveBeenCalled();
    await recordEmailSent(db as never, 100, alert);
    await recordEmailSent(db as never, 100, alert);
    expect(alert).toHaveBeenCalledTimes(1);
    expect((await emailAllowance(db as never, 100)).canSendRoutine).toBe(false);
  });
});

describe("classifyResendError", () => {
  test.each([
    [
      { name: "rate_limit_exceeded", message: "slow down", statusCode: 429 },
      "retry",
    ],
    [{ name: "application_error", message: "boom", statusCode: 500 }, "retry"],
    [
      { name: "application_error", message: "network", statusCode: null },
      "retry",
    ],
    [{ name: "validation_error", message: "bad", statusCode: 403 }, "rejected"],
    [{ name: "validation_error", message: "bad", statusCode: 422 }, "rejected"],
    [
      { name: "missing_api_key", message: "no key", statusCode: 401 },
      "rejected",
    ],
  ] as const)("%o → %s", (error, status) => {
    expect(classifyResendError(error as never).status).toBe(status);
  });
});

const firstWhere = (fn: { mock: { calls: unknown[][] } }) =>
  (fn.mock.calls[0][0] as { where: unknown }).where;

describe("deliverNotification", () => {
  const request = {
    kind: "run-finished" as const,
    userId: "u1",
    projectId: "p1",
    messageId: "m1",
    key: "run_1",
  };
  const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

  function database(overrides: Record<string, unknown> = {}) {
    return {
      user: {
        findUnique: vi.fn(async () => ({
          email: "owner@example.com",
          notifyEmail: true,
        })),
      },
      project: {
        findFirst: vi.fn(async () => ({ name: "Ember & Oak", slug: "ember" })),
      },
      message: {
        findFirst: vi.fn(async () => ({
          startedAt: new Date(NOW - 5 * 60_000),
        })),
      },
      githubExport: {
        findFirst: vi.fn(async () => ({
          repositoryUrl: "https://github.com/acme/site",
        })),
      },
      emailUsage: {
        findUnique: vi.fn(async () => ({ sent: 0 })),
        upsert: vi.fn(async () => ({ sent: 1, alertedAt: null })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      ...overrides,
    };
  }
  const deliver = (
    db: ReturnType<typeof database>,
    fake = fakeEmailProvider(),
    extra = {},
  ) =>
    deliverNotification({
      db: db as never,
      provider: fake.provider,
      request,
      appUrl: "https://vibe.test/",
      dailyLimit: 100,
      alert: vi.fn(),
      now: () => NOW,
      ...extra,
    });

  test("sends one email to the user with a stable idempotency key and counts it", async () => {
    const db = database();
    const fake = fakeEmailProvider();
    await expect(deliver(db, fake)).resolves.toEqual({
      status: "sent",
      id: "email_fake",
    });
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]).toMatchObject({
      to: "owner@example.com",
      subject: "Ember & Oak is ready",
      idempotencyKey: "notify/run-finished/run_1",
    });
    expect(fake.sent[0].text).toContain("https://vibe.test/p/ember");
    expect(db.emailUsage.upsert).toHaveBeenCalledOnce();
  });

  test("looks up the project only among the user's own projects", async () => {
    const db = database();
    await deliver(db);
    expect(firstWhere(db.project.findFirst)).toEqual({
      id: "p1",
      userId: "u1",
    });
  });

  test("skips quietly when the user turned notifications off, the build was quick or the data is gone", async () => {
    const off = database({
      user: {
        findUnique: vi.fn(async () => ({
          email: "a@b.co",
          notifyEmail: false,
        })),
      },
    });
    const fake = fakeEmailProvider();
    await expect(deliver(off, fake)).resolves.toEqual({
      status: "skipped",
      reason: "opted-out",
    });
    const quick = database({
      message: {
        findFirst: vi.fn(async () => ({ startedAt: new Date(NOW - 4_000) })),
      },
    });
    await expect(deliver(quick, fake)).resolves.toMatchObject({
      reason: "too-fast",
    });
    const gone = database({ project: { findFirst: vi.fn(async () => null) } });
    await expect(deliver(gone, fake)).resolves.toMatchObject({
      reason: "missing-data",
    });
    expect(fake.sent).toHaveLength(0);
  });

  test("a rate limit or server error is retried, a refusal is not", async () => {
    const db = database();
    await expect(
      deliver(
        db,
        fakeEmailProvider(() => ({ status: "retry", reason: "429" })),
      ),
    ).rejects.toBeInstanceOf(EmailRetry);
    expect(db.emailUsage.upsert).not.toHaveBeenCalled();
    const refused = await deliver(
      db,
      fakeEmailProvider(() => ({
        status: "rejected",
        reason:
          "validation_error: You can only send testing emails to your own email address",
      })),
    );
    expect(refused.status).toBe("rejected");
    expect(db.emailUsage.upsert).not.toHaveBeenCalled();
  });

  test("an export email carries the repository from the user's own export", async () => {
    const db = database();
    const fake = fakeEmailProvider();
    await deliver(db, fake, {
      request: {
        kind: "export-finished",
        userId: "u1",
        projectId: "p1",
        exportId: "e1",
        key: "req1",
      },
    });
    expect(firstWhere(db.githubExport.findFirst)).toEqual({
      id: "e1",
      projectId: "p1",
      userId: "u1",
    });
    expect(fake.sent[0].text).toContain("https://github.com/acme/site");
  });

  test("a finished-build email is held back once 80% of the day is used, a failure isn't", async () => {
    const db = database({
      emailUsage: {
        findUnique: vi.fn(async () => ({ sent: 85 })),
        upsert: vi.fn(async () => ({ sent: 86, alertedAt: new Date() })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    });
    const fake = fakeEmailProvider();
    await expect(deliver(db, fake)).resolves.toMatchObject({
      reason: "budget",
    });
    await expect(
      deliver(db, fake, { request: { ...request, kind: "run-failed" } }),
    ).resolves.toMatchObject({ status: "sent" });
  });
});
