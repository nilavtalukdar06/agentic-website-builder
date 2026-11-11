import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { HourBucket } from "@/lib/status";
import { hourSummary, UptimeBars, UptimeLegend } from "./uptime-bars";

function bucket(overrides: Partial<HourBucket> = {}): HourBucket {
  return {
    start: new Date("2026-11-11T13:00:00Z"),
    checks: 12,
    ok: 12,
    expected: 12,
    uptime: 1,
    averageLatencyMs: 90,
    state: "operational",
    ...overrides,
  };
}

describe("hourSummary", () => {
  test("describes an hour with checks", () => {
    expect(hourSummary(bucket())).toBe(
      "100% uptime, 12 of 12 checks passed, 90 ms average response",
    );
  });

  test("describes a missing hour", () => {
    expect(hourSummary(bucket({ state: "no-data", uptime: null }))).toBe(
      "No data for this hour",
    );
  });
});

describe("UptimeBars", () => {
  test("renders one token-coloured bar per state with screen reader text", () => {
    render(
      <UptimeBars
        label="Hourly uptime"
        buckets={[
          bucket(),
          bucket({
            start: new Date("2026-11-11T14:00:00Z"),
            ok: 11,
            uptime: 11 / 12,
            state: "degraded",
          }),
          bucket({
            start: new Date("2026-11-11T15:00:00Z"),
            ok: 0,
            uptime: 0,
            state: "outage",
          }),
          bucket({
            start: new Date("2026-11-11T16:00:00Z"),
            uptime: null,
            state: "no-data",
          }),
        ]}
      />,
    );
    const bars = Array.from(
      document.querySelectorAll("[data-slot='uptime-bar']"),
    );
    expect(bars.map((bar) => bar.getAttribute("data-state"))).toEqual([
      "operational",
      "degraded",
      "outage",
      "no-data",
    ]);
    expect(
      bars.map(
        (bar) => bar.querySelector("[data-slot='tooltip-trigger']")?.className,
      ),
    ).toEqual([
      expect.stringContaining("bg-success"),
      expect.stringContaining("bg-warning"),
      expect.stringContaining("bg-destructive"),
      expect.stringContaining("bg-muted"),
    ]);
    expect(
      screen.getByText(/Wed 11 Nov, 14:00–15:00 UTC: Degraded/),
    ).toBeInTheDocument();
  });
});

describe("UptimeLegend", () => {
  test("lists every state", () => {
    render(<UptimeLegend />);
    for (const label of ["Operational", "Degraded", "Outage", "No data"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
