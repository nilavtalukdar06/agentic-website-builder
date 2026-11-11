export const CHECK_INTERVAL_MINUTES = 5;
export const CHECKS_PER_HOUR = 60 / CHECK_INTERVAL_MINUTES;
export const STALE_AFTER_MS = 3 * CHECK_INTERVAL_MINUTES * 60 * 1000;
export const SLOW_RESPONSE_MS = 1500;
export const RETENTION_DAYS = 30;

const HOUR_MS = 60 * 60 * 1000;

export const statusRanges = ["24h", "72h", "7d"] as const;
export type StatusRange = (typeof statusRanges)[number];

export const statusRangeHours: Record<StatusRange, number> = {
  "24h": 24,
  "72h": 72,
  "7d": 168,
};

export const statusRangeLabels: Record<StatusRange, string> = {
  "24h": "24 hours",
  "72h": "3 days",
  "7d": "7 days",
};

export type HourState = "operational" | "degraded" | "outage" | "no-data";

export const hourStateLabels: Record<HourState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  "no-data": "No data",
};

export type HealthCheckSample = {
  checkedAt: Date;
  ok: boolean;
  latencyMs: number;
};

export type HourBucket = {
  start: Date;
  checks: number;
  ok: number;
  expected: number;
  uptime: number | null;
  averageLatencyMs: number | null;
  state: HourState;
};

export function startOfHour(date: Date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

export function stateForUptime(uptime: number | null): HourState {
  if (uptime === null) return "no-data";
  if (uptime >= 0.99) return "operational";
  if (uptime >= 0.8) return "degraded";
  return "outage";
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

export function buildHourlyBuckets({
  checks,
  hours,
  now,
  firstCheckAt,
}: {
  checks: HealthCheckSample[];
  hours: number;
  now: Date;
  firstCheckAt: Date | null;
}): HourBucket[] {
  const currentHour = startOfHour(now).getTime();
  const byHour = new Map<number, HealthCheckSample[]>();
  for (const check of checks) {
    const key = startOfHour(check.checkedAt).getTime();
    const list = byHour.get(key);
    if (list) list.push(check);
    else byHour.set(key, [check]);
  }

  return Array.from({ length: hours }, (_, index) => {
    const start = currentHour - (hours - 1 - index) * HOUR_MS;
    const samples = byHour.get(start) ?? [];
    const ok = samples.filter((sample) => sample.ok).length;
    const averageLatencyMs = average(samples.map((sample) => sample.latencyMs));

    let expected = 0;
    if (start === currentHour) {
      expected = samples.length;
    } else if (firstCheckAt && start + HOUR_MS > firstCheckAt.getTime()) {
      const live = Math.max(0, start + HOUR_MS - firstCheckAt.getTime());
      expected = Math.min(
        CHECKS_PER_HOUR,
        Math.max(1, Math.ceil(live / (CHECK_INTERVAL_MINUTES * 60 * 1000))),
      );
    }

    const uptime = expected > 0 ? Math.min(ok, expected) / expected : null;
    return {
      start: new Date(start),
      checks: samples.length,
      ok,
      expected,
      uptime,
      averageLatencyMs,
      state: stateForUptime(uptime),
    };
  });
}

export function summarizeBuckets(buckets: HourBucket[]) {
  let ok = 0;
  let expected = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  for (const bucket of buckets) {
    ok += Math.min(bucket.ok, bucket.expected);
    expected += bucket.expected;
    if (bucket.averageLatencyMs !== null) {
      latencyTotal += bucket.averageLatencyMs * bucket.checks;
      latencyCount += bucket.checks;
    }
  }
  return {
    uptime: expected > 0 ? ok / expected : null,
    averageLatencyMs:
      latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : null,
  };
}

export type OverallStatus = "operational" | "degraded" | "outage";

export const overallStatusCopy: Record<
  OverallStatus,
  { title: string; description: string }
> = {
  operational: {
    title: "All systems operational",
    description: "Vibe is running normally.",
  },
  degraded: {
    title: "Degraded performance",
    description: "Vibe is up, but some checks failed or responded slowly.",
  },
  outage: {
    title: "Service disruption",
    description: "Recent health checks failed or are missing.",
  },
};

export function overallStatus({
  latest,
  lastHourUptime,
  now,
}: {
  latest: HealthCheckSample;
  lastHourUptime: number | null;
  now: Date;
}): OverallStatus {
  const stale = now.getTime() - latest.checkedAt.getTime() > STALE_AFTER_MS;
  if (!latest.ok || stale) return "outage";
  if (
    latest.latencyMs > SLOW_RESPONSE_MS ||
    (lastHourUptime !== null && lastHourUptime < 0.99)
  ) {
    return "degraded";
  }
  return "operational";
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatUtcDay(date: Date) {
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

export function formatUtcTime(date: Date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatUtcHourRange(start: Date) {
  const end = new Date(start.getTime() + HOUR_MS);
  return `${formatUtcDay(start)}, ${formatUtcTime(start)}–${formatUtcTime(end)} UTC`;
}

export function formatUtcDateTime(date: Date) {
  return `${formatUtcDay(date)}, ${formatUtcTime(date)} UTC`;
}

export function formatUptime(uptime: number | null) {
  if (uptime === null) return "—";
  const percent = uptime * 100;
  if (percent === 100) return "100%";
  return `${Math.floor(percent * 100) / 100}%`;
}
