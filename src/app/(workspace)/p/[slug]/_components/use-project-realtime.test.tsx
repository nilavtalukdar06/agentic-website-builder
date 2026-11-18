import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const bus = vi.hoisted(() => ({
  push: (_event: unknown) => {},
}));

vi.mock("inngest/react", async () => {
  const { useEffect, useState } = await import("react");
  return {
    useRealtime: ({ key }: { key: string }) => {
      const [messages, setMessages] = useState<unknown[]>([]);
      useEffect(() => {
        setMessages([]);
      }, [key]);
      useEffect(() => {
        bus.push = (event) => setMessages((all) => [...all, event]);
      }, []);
      return {
        connectionStatus: "open",
        messages: { all: messages },
      };
    },
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => new Proxy({}, { get: () => ({ pathFilter: () => ({}) }) }),
}));
vi.mock("@/lib/realtime-token", () => ({ fetchRealtimeToken: vi.fn() }));

const { useProjectRealtime } = await import("./use-project-realtime");

const data = (topic: string, payload: unknown) => ({
  kind: "data",
  topic,
  data: payload,
});

function setup(initial: boolean) {
  return renderHook(
    ({ building }: { building: boolean }) => useProjectRealtime("p1", building),
    { initialProps: { building: initial } },
  );
}

beforeEach(() => {
  bus.push = () => {};
});

describe("useProjectRealtime", () => {
  test("the next run starts clean even though the previous run's end event never arrived", () => {
    const view = setup(true);
    act(() => {
      bus.push(data("status", { state: "building" }));
      bus.push(
        data("task", {
          kind: "note",
          label: "Created card.tsx, edited page.tsx",
        }),
      );
      bus.push(
        data("file", { phase: "started", path: "card.tsx", verb: "created" }),
      );
    });
    expect(view.result.current.live.tasks).toHaveLength(1);
    expect(view.result.current.live.files).toHaveLength(1);

    view.rerender({ building: false });
    view.rerender({ building: true });

    expect(view.result.current.live.tasks).toHaveLength(0);
    expect(view.result.current.live.files).toHaveLength(0);
    expect(view.result.current.live.state).toBeNull();

    act(() => {
      bus.push(data("status", { state: "thinking" }));
      bus.push(data("task", { kind: "note", label: "Second run" }));
    });
    expect(view.result.current.live.state).toBe("thinking");
    expect(view.result.current.live.tasks).toEqual([
      { kind: "note", label: "Second run" },
    ]);
  });

  test("keeps a running run's events when nothing was paused", () => {
    const view = setup(true);
    act(() => {
      bus.push(data("task", { kind: "note", label: "One" }));
    });
    view.rerender({ building: true });
    expect(view.result.current.live.tasks).toHaveLength(1);
  });

  test("a queued run that follows a finished one starts clean through its end event", () => {
    const view = setup(true);
    act(() => {
      bus.push(data("task", { kind: "note", label: "First" }));
      bus.push(data("status", { state: "done" }));
      bus.push(data("task", { kind: "note", label: "Second" }));
    });
    expect(view.result.current.live.tasks).toEqual([
      { kind: "note", label: "Second" },
    ]);
  });
});
