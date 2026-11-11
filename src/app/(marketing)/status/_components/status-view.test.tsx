import { fireEvent, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildHourlyBuckets } from "@/lib/status";
import {
  renderWithQueryClient,
  resetTrpcHandlers,
  trpcHandlers,
} from "@/test/trpc";
import { StatusView } from "./status-view";

vi.mock("@/trpc/client", async () => {
  const { trpcMock } = await import("@/test/trpc");
  return { useTRPC: () => trpcMock };
});

const now = new Date("2026-11-11T14:30:00Z");

function data(overrides: Record<string, unknown> = {}) {
  const hours = 24;
  const checks = Array.from({ length: 6 }, (_, index) => ({
    checkedAt: new Date(
      `2026-11-11T14:${String(index * 5).padStart(2, "0")}:00Z`,
    ),
    ok: true,
    latencyMs: 120,
  }));
  return {
    hasData: true as const,
    range: "24h" as const,
    now,
    buckets: buildHourlyBuckets({
      checks,
      hours,
      now,
      firstCheckAt: new Date("2026-11-11T08:00:00Z"),
    }),
    uptime: 0.9995,
    averageLatencyMs: 120,
    lastCheckedAt: new Date("2026-11-11T14:25:00Z"),
    status: "operational" as const,
    ...overrides,
  };
}

function renderView(searchParams = "") {
  const onUrlUpdate = vi.fn();
  const Wrapper = withNuqsTestingAdapter({ searchParams, onUrlUpdate });
  renderWithQueryClient(
    <Wrapper>
      <StatusView />
    </Wrapper>,
  );
  return { onUrlUpdate };
}

beforeEach(() => {
  resetTrpcHandlers();
});

describe("StatusView", () => {
  test("shows a skeleton while loading", () => {
    trpcHandlers["status.uptime"] = vi.fn(() => new Promise(() => {}));
    renderView();
    expect(
      document.querySelector("[data-slot='status-skeleton']"),
    ).toBeInTheDocument();
  });

  test("shows the banner, stats and one bar per hour", async () => {
    trpcHandlers["status.uptime"] = vi.fn().mockResolvedValue(data());
    renderView();
    expect(
      await screen.findByText("All systems operational"),
    ).toBeInTheDocument();
    expect(screen.getByText("99.95%")).toBeInTheDocument();
    expect(screen.getByText("120 ms")).toBeInTheDocument();
    expect(screen.getByText("14:25 UTC")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-slot='uptime-bar']")).toHaveLength(
      24,
    );
    expect(
      screen.getByRole("list", {
        name: "Hourly uptime for the last 24 hours",
      }),
    ).toBeInTheDocument();
  });

  test("reflects degraded and outage banners", async () => {
    trpcHandlers["status.uptime"] = vi
      .fn()
      .mockResolvedValue(data({ status: "outage" }));
    renderView();
    expect(await screen.findByText("Service disruption")).toBeInTheDocument();
  });

  test("requests the range from the URL and updates it from the tabs", async () => {
    const handler = vi.fn().mockResolvedValue(data());
    trpcHandlers["status.uptime"] = handler;
    const { onUrlUpdate } = renderView("?range=72h");
    await screen.findByText("All systems operational");
    expect(handler).toHaveBeenCalledWith({ range: "72h" });

    fireEvent.click(screen.getByRole("tab", { name: "7 days" }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls[0][0].searchParams.get("range")).toBe("7d");
    await waitFor(() => expect(handler).toHaveBeenCalledWith({ range: "7d" }));
  });

  test("shows an empty state before the first check", async () => {
    trpcHandlers["status.uptime"] = vi
      .fn()
      .mockResolvedValue({ hasData: false, range: "24h", now });
    renderView();
    expect(
      await screen.findByText("No checks recorded yet"),
    ).toBeInTheDocument();
  });

  test("shows an error with retry", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(data());
    trpcHandlers["status.uptime"] = handler;
    renderView();
    expect(
      await screen.findByText("Couldn't load the status"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("All systems operational"),
    ).toBeInTheDocument();
  });
});
