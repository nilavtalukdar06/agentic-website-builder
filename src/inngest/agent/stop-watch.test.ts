import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { StopRequested, withStopWatch } from "./stop-watch";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const hang = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) =>
    signal?.addEventListener("abort", () => reject(new Error("aborted"))),
  );

describe("withStopWatch", () => {
  test("runs without watching when there is nothing to check", async () => {
    await expect(
      withStopWatch(undefined, async (signal) => signal === undefined),
    ).resolves.toBe(true);
  });

  test("returns the result and stops polling when the call finishes", async () => {
    const shouldStop = vi.fn().mockResolvedValue(false);
    await expect(
      withStopWatch(shouldStop, async () => "done", 100),
    ).resolves.toBe("done");
    await vi.advanceTimersByTimeAsync(1000);
    expect(shouldStop).not.toHaveBeenCalled();
  });

  test("aborts an in-flight call within one poll once a stop is requested", async () => {
    let requested = false;
    const shouldStop = vi.fn(async () => requested);
    const pending = withStopWatch(shouldStop, hang, 100);
    const outcome = pending.catch((error) => error);
    await vi.advanceTimersByTimeAsync(250);
    expect(shouldStop).toHaveBeenCalledTimes(2);
    requested = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toBeInstanceOf(StopRequested);
  });

  test("discards a result that finished after the stop was requested", async () => {
    const shouldStop = vi.fn().mockResolvedValue(true);
    const outcome = withStopWatch(
      shouldStop,
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 500)),
      100,
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(600);
    expect(await outcome).toBeInstanceOf(StopRequested);
  });

  test("passes other errors through and ignores failing checks", async () => {
    const shouldStop = vi.fn().mockRejectedValue(new Error("db down"));
    const outcome = withStopWatch(
      shouldStop,
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("model failed")), 300),
        ),
      100,
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(400);
    const error = await outcome;
    expect(error).not.toBeInstanceOf(StopRequested);
    expect((error as Error).message).toBe("model failed");
  });
});
