// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../publisher", () => ({ createPublisher: () => mocks.publish }));
vi.mock("@/server/storage/attachments", () => ({ storeAttachment: vi.fn() }));
vi.mock("@/server/browser", () => ({ browserAvailability: vi.fn() }));

const { checkInBrowser, planVisits, screenshotKey, MAX_PAGE_LOADS } =
  await import("./browser-step");
const { fakeBrowserProvider } = await import("@/server/browser/fake");

const preview = "https://3000-abc.e2b.app";
const model = {
  id: "moonshotai/kimi-k2.7-code",
  name: "Kimi",
  provider: "moonshotai",
  providerLabel: "Moonshot AI",
  vision: true,
  pricing: null,
};

function run(
  provider: Parameters<typeof checkInBrowser>[0]["provider"],
  extra: Partial<Parameters<typeof checkInBrowser>[0]> = {},
) {
  const stored: string[] = [];
  return {
    stored,
    result: checkInBrowser({
      projectId: "p1",
      runId: "r1",
      round: 0,
      previewUrl: preview,
      model,
      routes: ["/", "/pricing"],
      interactions: [],
      provider,
      store: async (key) => {
        stored.push(key);
      },
      ...extra,
    }),
  };
}

const published = () =>
  mocks.publish.mock.calls
    .filter(([topic]) => topic === "browser")
    .map(([, data]) => data);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publish.mockResolvedValue(undefined);
});

describe("planVisits", () => {
  test("checks the home page first, at desktop and phone width, skipping dynamic routes", () => {
    expect(planVisits(["/pricing", "/blog/[slug]"])).toEqual([
      { route: "/", viewport: "desktop" },
      { route: "/", viewport: "phone" },
      { route: "/pricing", viewport: "desktop" },
      { route: "/pricing", viewport: "phone" },
    ]);
  });

  test("caps page loads", () => {
    const routes = Array.from({ length: 10 }, (_, index) => `/p${index}`);
    expect(planVisits(routes)).toHaveLength(MAX_PAGE_LOADS);
  });
});

describe("checkInBrowser", () => {
  test("a clean site passes, streams the live view and each check, and stores screenshots", async () => {
    const fake = fakeBrowserProvider();
    const { result, stored } = run(fake.provider);
    const outcome = await result;
    expect(outcome.status).toBe("passed");
    expect(outcome.diagnostics).toEqual([]);
    expect(fake.visits).toHaveLength(4);
    expect(stored).toEqual([
      screenshotKey("p1", "r1", 0, "desktop"),
      screenshotKey("p1", "r1", 0, "phone"),
    ]);
    expect(outcome.screenshots.map((shot) => shot.viewport)).toEqual([
      "desktop",
      "phone",
    ]);
    const events = published();
    expect(events[0]).toEqual({
      phase: "session",
      liveUrl: "https://www.browserbase.com/devtools-fullscreen/fake",
      round: 0,
    });
    expect(events.filter((event) => event.phase === "check")).toHaveLength(8);
    expect(events.at(-1)).toMatchObject({ phase: "closed", status: "passed" });
    expect(fake.closedCount()).toBe(1);
  });

  test("a page that scrolls sideways on a phone becomes a finding", async () => {
    const fake = fakeBrowserProvider({
      pages: {
        "/pricing@phone": {
          overflow: {
            scrollWidth: 600,
            innerWidth: 390,
            offender: "table (600px)",
          },
        },
      },
    });
    const outcome = await run(fake.provider).result;
    expect(outcome.status).toBe("failed");
    expect(outcome.diagnostics).toHaveLength(1);
    expect(outcome.diagnostics[0].message).toContain(
      "/pricing at phone width (390px): the page scrolls sideways",
    );
    const failed = outcome.checks.find((check) => check.status === "failed");
    expect(failed).toMatchObject({ route: "/pricing", viewport: "phone" });
  });

  test("tries the planned interactions and reports the ones that don't work", async () => {
    const fake = fakeBrowserProvider({
      interactions: {
        "Add a task called Buy milk": {
          passed: false,
          detail: "the list is still empty",
        },
      },
    });
    const outcome = await run(fake.provider, {
      routes: [],
      interactions: [
        {
          route: "/",
          action: "Add a task called Buy milk",
          expect: "Buy milk is listed",
        },
        { route: "/", action: "Mark it done", expect: "It is struck through" },
      ],
    }).result;
    expect(fake.actions).toEqual([
      "Add a task called Buy milk",
      "Mark it done",
    ]);
    expect(outcome.calls).toHaveLength(2);
    expect(outcome.diagnostics.map((item) => item.message)).toEqual([
      '/: "Add a task called Buy milk" didn\'t work as expected. Expected: Buy milk is listed. Seen: the list is still empty',
    ]);
    expect(
      outcome.checks
        .filter((check) => check.kind === "interaction")
        .map((check) => check.status),
    ).toEqual(["failed", "passed"]);
  });

  test("stops at once when an action leaves the preview", async () => {
    const fake = fakeBrowserProvider({
      interactions: {
        "Click the external link": {
          passed: true,
          detail: "ok",
          navigateTo: "https://evil.example/",
        },
      },
    });
    const outcome = await run(fake.provider, {
      routes: [],
      interactions: [
        { route: "/", action: "Click the external link", expect: "x" },
        { route: "/", action: "Never runs", expect: "y" },
      ],
    }).result;
    expect(outcome.reason).toBe("the page tried to leave the preview");
    expect(fake.actions).toEqual(["Click the external link"]);
    expect(fake.closedCount()).toBe(1);
  });

  test("is skipped, not failed, when browser checks are unavailable or can't start", async () => {
    const disabled = await run({ disabled: "no Browserbase key is set" })
      .result;
    expect(disabled).toMatchObject({
      status: "skipped",
      reason: "no Browserbase key is set",
      diagnostics: [],
    });
    const broken = fakeBrowserProvider({ failOpen: new Error("quota") });
    const failed = await run(broken.provider).result;
    expect(failed).toMatchObject({
      status: "skipped",
      reason: "the browser couldn't start (quota)",
      diagnostics: [],
    });
    expect(published().at(-1)).toMatchObject({
      phase: "closed",
      status: "skipped",
      summary: "Browser check skipped: the browser couldn't start (quota).",
    });
  });

  test("stops before spending more when the user stops the run", async () => {
    const fake = fakeBrowserProvider();
    let calls = 0;
    const outcome = await run(fake.provider, {
      shouldStop: async () => ++calls > 2,
    }).result;
    expect(outcome.reason).toBe("the run was stopped");
    expect(fake.visits.length).toBeLessThan(4);
    expect(fake.closedCount()).toBe(1);
  });
});
