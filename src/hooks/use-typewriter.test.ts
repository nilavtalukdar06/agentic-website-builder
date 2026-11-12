import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTypewriter } from "./use-typewriter";

const phrases = ["Hi", "Yo"] as const;

function tick(ms: number, step = 10) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    act(() => vi.advanceTimersByTime(step));
  }
}

function mockMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe("useTypewriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("types, holds, deletes and moves to the next phrase", () => {
    mockMotion(false);
    const { result } = renderHook(() =>
      useTypewriter(phrases, {
        typeMs: 10,
        deleteMs: 5,
        holdMs: 100,
        pauseMs: 20,
      }),
    );
    expect(result.current.text).toBe("");
    act(() => vi.advanceTimersByTime(10));
    expect(result.current.text).toBe("H");
    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toEqual({ text: "Hi", typing: false });
    act(() => vi.advanceTimersByTime(100));
    act(() => vi.advanceTimersByTime(5));
    expect(result.current).toEqual({ text: "H", typing: true });
    act(() => vi.advanceTimersByTime(5));
    expect(result.current.text).toBe("");
    act(() => vi.advanceTimersByTime(20));
    act(() => vi.advanceTimersByTime(10));
    expect(result.current.text).toBe("Y");
  });

  test("shows whole phrases when the user prefers reduced motion", () => {
    mockMotion(true);
    const { result } = renderHook(() =>
      useTypewriter(phrases, { typeMs: 10, holdMs: 100 }),
    );
    expect(result.current).toEqual({ text: "Hi", typing: false });
    act(() => vi.advanceTimersByTime(120));
    expect(result.current).toEqual({ text: "Yo", typing: false });
  });

  test("a single phrase stays put", () => {
    mockMotion(false);
    const { result } = renderHook(() =>
      useTypewriter(["Go"], { typeMs: 10, holdMs: 50 }),
    );
    tick(1000);
    expect(result.current).toEqual({ text: "Go", typing: false });
  });
});
