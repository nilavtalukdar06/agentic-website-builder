import { describe, expect, test } from "vitest";
import { formatEdited, formatRelativeTime } from "./relative-time";

const now = new Date("2026-11-11T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

describe("formatRelativeTime", () => {
  test.each([
    [10, "just now"],
    [12 * minute, "12 minutes ago"],
    [2 * hour, "2 hours ago"],
    [day, "yesterday"],
    [3 * day, "3 days ago"],
    [7 * day, "last week"],
    [14 * day, "2 weeks ago"],
    [30 * day, "last month"],
    [60 * day, "2 months ago"],
    [400 * day, "last year"],
  ])("%i seconds ago → %s", (seconds, label) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(label);
  });

  test("prefixes Edited", () => {
    expect(formatEdited(ago(3 * day), now)).toBe("Edited 3 days ago");
  });
});
