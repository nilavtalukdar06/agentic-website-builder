import { describe, expect, test } from "vitest";
import {
  advanceLive,
  consoleLines,
  emptyTracker,
  type LiveEvent,
  reduceLiveRun,
  splitLiveEvents,
  visibleLiveText,
} from "./live-run";

const events: LiveEvent[] = [
  { topic: "preview", data: { url: "https://old.e2b.app" } },
  { topic: "status", data: { state: "done" } },
  { topic: "status", data: { state: "thinking" } },
  { topic: "reasoning", data: { turn: 0, delta: "Plan " } },
  { topic: "reasoning", data: { turn: 0, delta: "it" } },
  { topic: "text", data: { turn: 0, delta: "Starting" } },
  { topic: "text", data: { turn: 1, delta: "Now the footer" } },
  { topic: "task", data: { kind: "sandbox", label: "Created sandbox" } },
  {
    topic: "file",
    data: { phase: "started", path: "app/page.tsx", verb: "edited" },
  },
  {
    topic: "file",
    data: { phase: "written", path: "app/page.tsx", verb: "edited", lines: 12 },
  },
  {
    topic: "file",
    data: { phase: "started", path: "components/footer.tsx", verb: "created" },
  },
  {
    topic: "tool",
    data: { phase: "call", callId: "c1", name: "terminal", command: "npm i x" },
  },
  {
    topic: "tool",
    data: {
      phase: "output",
      callId: "c1",
      name: "terminal",
      chunk: "added 1\n",
    },
  },
  {
    topic: "tool",
    data: { phase: "result", callId: "c1", name: "terminal", exitCode: 0 },
  },
  {
    topic: "search",
    data: {
      query: "stripe",
      sources: [
        { title: "Stripe", url: "https://stripe.com" },
        { title: "Stripe", url: "https://stripe.com" },
      ],
    },
  },
  { topic: "guard", data: { stage: "input", verdict: "review" } },
  { topic: "credits", data: { used: 7 } },
  { topic: "status", data: { state: "building" } },
];

describe("splitLiveEvents", () => {
  test("keeps only the events after the last finished run as current", () => {
    const { finished, current } = splitLiveEvents(events);
    expect(finished).toHaveLength(2);
    expect(reduceLiveRun(finished).previewUrl).toBe("https://old.e2b.app");
    expect(current[0]).toEqual({
      topic: "status",
      data: { state: "thinking" },
    });
  });
});

describe("reduceLiveRun", () => {
  const run = reduceLiveRun(splitLiveEvents(events).current);

  test("collects reasoning and the latest turn's text", () => {
    expect(run.reasoning).toBe("Plan it");
    expect(run.text).toBe("Now the footer");
    expect(run.state).toBe("building");
  });

  test("tracks files, tools, sources, guard and credits", () => {
    expect(run.files).toEqual([
      { path: "app/page.tsx", verb: "edited", lines: 12, written: true },
      {
        path: "components/footer.tsx",
        verb: "created",
        lines: null,
        written: false,
      },
    ]);
    expect(run.tools).toEqual([
      {
        callId: "c1",
        name: "terminal",
        command: "npm i x",
        output: "added 1\n",
        exitCode: 0,
        done: true,
      },
    ]);
    expect(run.sources).toEqual([
      { title: "Stripe", url: "https://stripe.com" },
    ]);
    expect(run.guard).toEqual([{ stage: "input", verdict: "review" }]);
    expect(run.credits).toBe(7);
    expect(run.tasks).toEqual([{ kind: "sandbox", label: "Created sandbox" }]);
  });
});

describe("consoleLines", () => {
  test("prints commands, their output and failures", () => {
    const now = new Date(0);
    expect(
      consoleLines(
        [
          {
            command: "npm run build",
            output: "warning: slow\nError: boom\n",
            exitCode: 1,
            done: true,
          },
          { command: null, output: "ignored", exitCode: null, done: false },
        ],
        now,
      ).map((line) => [line.level, line.message]),
    ).toEqual([
      ["log", "$ npm run build"],
      ["warn", "warning: slow"],
      ["error", "Error: boom"],
      ["error", "exit code 1"],
    ]);
  });
});

describe("advanceLive", () => {
  test("keeps every event of a long run and resets after a terminal status", () => {
    const deltas: LiveEvent[] = Array.from({ length: 5000 }, () => ({
      topic: "reasoning",
      data: { turn: 0, delta: "x" },
    }));
    const stream: LiveEvent[] = [
      {
        topic: "task",
        data: { kind: "file", verb: "created", path: "a.tsx", lines: 3 },
      },
      ...deltas,
    ];
    let tracker = advanceLive(emptyTracker(), stream);
    expect(tracker.run.tasks).toHaveLength(1);
    expect(tracker.run.reasoning).toHaveLength(5000);
    tracker = advanceLive(tracker, [
      ...stream,
      { topic: "preview", data: { url: "https://p.e2b.app" } },
      { topic: "status", data: { state: "done" } },
    ]);
    expect(tracker.finished).toBe(1);
    expect(tracker.lastPreview).toBe("https://p.e2b.app");
    expect(tracker.run.tasks).toHaveLength(0);
  });
});

describe("visibleLiveText", () => {
  test("hides the task summary while it streams", () => {
    expect(
      visibleLiveText("Done.\n<task_summary>Built it</task_summary>"),
    ).toBe("Done.");
    expect(visibleLiveText("<task_summary>Built")).toBe("");
    expect(visibleLiveText("Plain text")).toBe("Plain text");
  });
});

describe("run steps", () => {
  test("record every step in order with its state", () => {
    const run = reduceLiveRun([
      { topic: "status", data: { state: "thinking" } },
      { topic: "task", data: { kind: "sandbox", label: "Connected" } },
      { topic: "task", data: { kind: "skill", name: "shadcn" } },
      { topic: "task", data: { kind: "read", paths: ["AGENTS.md"] } },
      { topic: "status", data: { state: "building" } },
      {
        topic: "tool",
        data: {
          phase: "call",
          callId: "c1",
          name: "terminal",
          command: "npm i motion",
        },
      },
      {
        topic: "tool",
        data: { phase: "result", callId: "c1", name: "terminal", exitCode: 0 },
      },
      { topic: "task", data: { kind: "install", packages: ["motion"] } },
      {
        topic: "file",
        data: { phase: "started", path: "a.tsx", verb: "created" },
      },
      {
        topic: "file",
        data: { phase: "written", path: "a.tsx", verb: "created", lines: 2 },
      },
      {
        topic: "task",
        data: { kind: "file", verb: "deleted", path: "old.tsx", lines: 0 },
      },
      {
        topic: "tool",
        data: {
          phase: "call",
          callId: "c2",
          name: "terminal",
          command: "npm run build",
        },
      },
      {
        topic: "tool",
        data: { phase: "result", callId: "c2", name: "terminal", exitCode: 1 },
      },
      { topic: "search", data: { query: "stripe pricing", sources: [] } },
      { topic: "status", data: { state: "compiling" } },
    ]);
    expect(
      run.steps.map((step) => [step.kind, step.label, step.status]),
    ).toEqual([
      ["thinking", "Thinking", "done"],
      ["sandbox", "Connected", "done"],
      ["skill", "Loaded skill", "done"],
      ["read", "Read", "done"],
      ["command", "Ran", "done"],
      ["install", "Installed", "done"],
      ["file", "Created", "done"],
      ["delete", "Deleted", "done"],
      ["command", "Command failed", "error"],
      ["search", "Searched the web", "done"],
      ["compile", "Compiling and saving the version", "active"],
    ]);
  });

  test("plan and check notes become done rows and task items", () => {
    const run = reduceLiveRun([
      { topic: "status", data: { state: "thinking" } },
      {
        topic: "task",
        data: { kind: "note", label: "Planned Ember & Oak: 1 page, 6 files" },
      },
      {
        topic: "task",
        data: { kind: "note", label: "Checks found 2 problems" },
      },
    ]);
    expect(
      run.steps.map(({ kind, label, status }) => ({ kind, label, status })),
    ).toEqual([
      { kind: "thinking", label: "Thinking", status: "done" },
      {
        kind: "note",
        label: "Planned Ember & Oak: 1 page, 6 files",
        status: "done",
      },
      { kind: "note", label: "Checks found 2 problems", status: "done" },
    ]);
    expect(run.tasks).toHaveLength(2);
  });

  test("browser events open a live session, update checks in place and close it", () => {
    const check = {
      id: "0-page-phone-/",
      kind: "page" as const,
      label: "Open / at phone width",
      route: "/",
      viewport: "phone" as const,
      status: "running" as const,
      detail: null,
    };
    const run = reduceLiveRun([
      {
        topic: "browser",
        data: {
          phase: "session",
          liveUrl: "https://www.browserbase.com/devtools-fullscreen/x",
          round: 0,
        },
      },
      { topic: "browser", data: { phase: "check", check } },
      {
        topic: "browser",
        data: {
          phase: "check",
          check: { ...check, status: "failed", detail: "scrolls sideways" },
        },
      },
    ]);
    expect(run.browser).toMatchObject({
      liveUrl: "https://www.browserbase.com/devtools-fullscreen/x",
      open: true,
      checks: [{ id: check.id, status: "failed", detail: "scrolls sideways" }],
    });
    expect(
      run.steps.map(({ kind, label, status }) => ({ kind, label, status })),
    ).toEqual([
      {
        kind: "browser",
        label: "Opened the site in a cloud browser",
        status: "done",
      },
      { kind: "browser", label: "Open / at phone width", status: "error" },
    ]);
    const closed = reduceLiveRun(
      [
        {
          topic: "browser",
          data: { phase: "closed", status: "failed", summary: "1 problem" },
        },
      ],
      run,
    );
    expect(closed.browser).toMatchObject({
      open: false,
      status: "failed",
      summary: "1 problem",
    });
    expect(run.browser?.open).toBe(true);
  });

  test("a repeated thinking status doesn't add a second row", () => {
    const run = reduceLiveRun([
      { topic: "status", data: { state: "thinking" } },
      { topic: "status", data: { state: "thinking" } },
    ]);
    expect(run.steps).toHaveLength(1);
  });
});

describe("browser progress", () => {
  const check = {
    id: "0-page-phone-/",
    kind: "page" as const,
    label: "Open / at phone width",
    route: "/",
    viewport: "phone" as const,
    status: "running" as const,
    detail: null,
  };
  const opened: LiveEvent = {
    topic: "browser",
    data: {
      phase: "session",
      liveUrl: "https://www.browserbase.com/live",
      round: 0,
    },
  };

  test("updates a check in place without mutating the previous render", () => {
    const running = reduceLiveRun([
      opened,
      { topic: "browser", data: { phase: "check", check } },
    ]);
    const finished = reduceLiveRun(
      [
        {
          topic: "browser",
          data: {
            phase: "check",
            check: {
              ...check,
              status: "failed",
              detail: "Content is wider than the phone",
            },
          },
        },
        {
          topic: "browser",
          data: {
            phase: "closed",
            status: "failed",
            summary: "Found sideways scrolling",
          },
        },
      ],
      running,
    );
    expect(running.browser?.checks[0].status).toBe("running");
    expect(running.browser?.open).toBe(true);
    expect(finished.browser).toMatchObject({ open: false, status: "failed" });
    expect(finished.browser?.checks).toHaveLength(1);
    expect(
      finished.steps.filter((step) => step.id === `browser-${check.id}`),
    ).toEqual([
      expect.objectContaining({
        status: "error",
        detail: "Content is wider than the phone",
      }),
    ]);
  });

  test("starts a fresh repair session while retaining the earlier step history", () => {
    const run = reduceLiveRun([
      opened,
      {
        topic: "browser",
        data: { phase: "check", check: { ...check, status: "failed" } },
      },
      {
        topic: "browser",
        data: { phase: "closed", status: "failed", summary: "Repair needed" },
      },
      { topic: "browser", data: { phase: "session", liveUrl: null, round: 1 } },
    ]);
    expect(run.browser).toMatchObject({
      round: 1,
      open: true,
      checks: [],
      status: null,
    });
    expect(run.steps.some((step) => step.status === "error")).toBe(true);
  });

  test("represents skipped checks without requiring a session event", () => {
    const run = reduceLiveRun([
      {
        topic: "browser",
        data: {
          phase: "closed",
          status: "skipped",
          summary: "No browser key configured",
        },
      },
    ]);
    expect(run.browser).toMatchObject({
      open: false,
      checks: [],
      status: "skipped",
    });
  });

  test("drops the session capability when the run finishes", () => {
    const tracker = advanceLive(emptyTracker(), [
      opened,
      { topic: "status", data: { state: "done" } },
    ]);
    expect(tracker.run.browser).toBeNull();
  });
});
