import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { attached: false, order: [] as string[], failCreate: false };
  const page = {
    setViewportSize: vi.fn(),
    goto: vi.fn(),
    waitForTimeout: vi.fn(),
    url: vi.fn(async () => "https://3000-abc.e2b.app/"),
    evaluate: vi.fn(async () => ({})),
    screenshot: vi.fn(),
  };
  const context = {
    addInitScript: vi.fn(async () => {
      state.order.push("init-script");
    }),
    activePage: vi.fn(async () => page),
    newPage: vi.fn(async () => page),
  };
  const browser = {
    sessionId: "sess_1",
    get context() {
      if (!state.attached) {
        throw new Error(
          "Browser context is unavailable. Attach the browser with await Stagehand.create({ browser }).",
        );
      }
      return context;
    },
    close: vi.fn(async () => undefined),
  };
  const stagehand = {
    close: vi.fn(async () => undefined),
    act: vi.fn(),
    extract: vi.fn(),
  };
  return { state, page, context, browser, stagehand };
});

vi.mock("server-only", () => ({}));
vi.mock("@browserbasehq/sdk", () => ({
  default: class {
    sessions = {
      debug: async () => ({
        debuggerFullscreenUrl:
          "https://www.browserbase.com/devtools-fullscreen/inspector.html?x=1",
      }),
    };
  },
}));
vi.mock("@browserbasehq/stagehand", () => ({
  browserbase: { launch: vi.fn(async () => mocks.browser) },
  Stagehand: {
    create: vi.fn(async () => {
      mocks.state.order.push("create");
      if (mocks.state.failCreate) throw new Error("init failed");
      mocks.state.attached = true;
      return mocks.stagehand;
    }),
  },
}));
vi.mock("./llm", () => ({ createGenerate: () => vi.fn() }));

const { browserbaseProvider } = await import("./browserbase");

const model = {
  id: "openai/test",
  name: "Test",
  provider: "openai",
  providerLabel: "OpenAI",
  vision: false,
  pricing: null,
};
const input = {
  previewUrl: "https://3000-abc.e2b.app",
  model,
  onModelCall: vi.fn(),
  beforeModelCall: vi.fn(),
  signal: new AbortController().signal,
};

beforeEach(() => {
  mocks.state.attached = false;
  mocks.state.order.length = 0;
  mocks.state.failCreate = false;
  mocks.browser.close.mockClear();
  mocks.stagehand.close.mockClear();
});

describe("browserbaseProvider", () => {
  test("attaches Stagehand before it uses the browser context", async () => {
    const session = await browserbaseProvider("bb_key").open(input);
    expect(mocks.state.order).toEqual(["create", "init-script"]);
    expect(session.liveUrl).toContain("browserbase.com/devtools-fullscreen");
  });

  test("closes Stagehand and then the browser when the session ends", async () => {
    const session = await browserbaseProvider("bb_key").open(input);
    await session.close();
    expect(mocks.stagehand.close).toHaveBeenCalledOnce();
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });

  test("releases the Browserbase session when Stagehand fails to start", async () => {
    mocks.state.failCreate = true;
    await expect(browserbaseProvider("bb_key").open(input)).rejects.toThrow(
      "init failed",
    );
    expect(mocks.browser.close).toHaveBeenCalledOnce();
  });
});
