import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryPanel } from "./memory-dialog";
import { MemoryMatches } from "@/components/workspace/memory-note";

const handlers = () => ({
  onToggle: vi.fn(),
  onForget: vi.fn(),
  onClear: vi.fn(),
});

describe("MemoryPanel", () => {
  it("shows a skeleton while loading and a retry on error", () => {
    const h = handlers();
    const onRetry = vi.fn();
    const { rerender } = render(
      <MemoryPanel state={{ status: "loading" }} {...h} />,
    );
    expect(
      screen.getByRole("status", { name: "Loading memory" }),
    ).toBeVisible();
    rerender(<MemoryPanel state={{ status: "error", onRetry }} {...h} />);
    expect(screen.getByText("Couldn't load your memory")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("explains when memory isn't set up and when nothing is remembered", () => {
    const h = handlers();
    const { rerender } = render(
      <MemoryPanel
        state={{ status: "ready", configured: false, enabled: true, items: [] }}
        {...h}
      />,
    );
    expect(screen.getByText("Memory isn’t available")).toBeVisible();
    rerender(
      <MemoryPanel
        state={{ status: "ready", configured: true, enabled: true, items: [] }}
        {...h}
      />,
    );
    expect(screen.getByText("Nothing remembered yet")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Clear all memory" }),
    ).not.toBeInTheDocument();
  });

  it("lists memories, forgets one, clears all and toggles memory", () => {
    const h = handlers();
    render(
      <MemoryPanel
        state={{
          status: "ready",
          configured: true,
          enabled: true,
          items: [
            {
              id: "m1",
              memory: "Prefers dark minimal designs",
              kind: "static",
            },
          ],
        }}
        {...h}
      />,
    );
    expect(
      screen.getByRole("list", { name: "What Vibe remembers" }),
    ).toHaveTextContent("Prefers dark minimal designs");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Forget: Prefers dark minimal designs",
      }),
    );
    expect(h.onForget).toHaveBeenCalledWith("m1");
    fireEvent.click(screen.getByRole("button", { name: "Clear all memory" }));
    expect(h.onClear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Use memory" }));
    expect(h.onToggle).toHaveBeenCalledWith(false);
  });
});

describe("MemoryMatches", () => {
  const base = {
    type: "memory" as const,
    reason: null,
    text: "I like teal",
  };

  it("confirms what was remembered and says why memory was unavailable", () => {
    const { rerender } = render(
      <MemoryMatches
        part={{ ...base, action: "remember", status: "saved", matches: [] }}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Remembered")).toBeVisible();
    rerender(
      <MemoryMatches
        part={{
          ...base,
          action: "remember",
          status: "unavailable",
          reason: "memory is turned off",
          matches: [],
        }}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("memory is turned off")).toBeVisible();
  });

  it("asks for confirmation before forgetting and then shows it is done", () => {
    const onConfirm = vi.fn();
    const part = {
      ...base,
      action: "forget" as const,
      status: "preview" as const,
      matches: [
        { id: "a", memory: "Likes teal accents", scope: "user" as const },
        { id: "b", memory: "Teal header", scope: "project" as const },
      ],
    };
    const { rerender } = render(
      <MemoryMatches part={part} onConfirm={onConfirm} />,
    );
    expect(screen.getByText("All projects")).toBeVisible();
    expect(screen.getByText("This project")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Forget these" }));
    expect(onConfirm).toHaveBeenCalled();
    rerender(<MemoryMatches part={part} onConfirm={onConfirm} done />);
    expect(screen.getByRole("status")).toHaveTextContent("Forgotten.");
  });
});
