import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "./notifications-dialog";

const ready = {
  status: "ready" as const,
  configured: true,
  enabled: true,
  email: "owner@example.com",
  limited: false,
};

describe("NotificationsPanel", () => {
  it("shows a skeleton while loading and a retry on error", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <NotificationsPanel state={{ status: "loading" }} onToggle={vi.fn()} />,
    );
    expect(
      screen.getByRole("status", { name: "Loading notifications" }),
    ).toBeVisible();
    rerender(
      <NotificationsPanel
        state={{ status: "error", onRetry }}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Couldn’t load your notifications")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("explains when email isn't set up", () => {
    render(
      <NotificationsPanel
        state={{ ...ready, configured: false }}
        onToggle={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Email notifications aren’t available"),
    ).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("names the address, flips the switch and warns about the test sender", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <NotificationsPanel state={ready} onToggle={onToggle} />,
    );
    expect(screen.getByText(/owner@example\.com/)).toBeVisible();
    expect(screen.queryByText(/free test sender/)).toBeNull();
    fireEvent.click(
      screen.getByRole("switch", { name: "Email me about my builds" }),
    );
    expect(onToggle).toHaveBeenCalledWith(false);
    rerender(
      <NotificationsPanel
        state={{ ...ready, limited: true, enabled: false }}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText(/free test sender/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("switch", { name: "Email me about my builds" }),
    );
    expect(onToggle).toHaveBeenLastCalledWith(true);
  });
});
