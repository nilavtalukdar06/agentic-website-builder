import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatUptime,
  formatUtcHourRange,
  type HourBucket,
  type HourState,
  hourStateLabels,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const barColors: Record<HourState, string> = {
  operational: "bg-success",
  degraded: "bg-warning",
  outage: "bg-destructive",
  "no-data": "bg-muted",
};

export function hourSummary(bucket: HourBucket) {
  if (bucket.state === "no-data") return "No data for this hour";
  const checks = `${Math.min(bucket.ok, bucket.expected)} of ${bucket.expected} checks passed`;
  const latency =
    bucket.averageLatencyMs === null
      ? ""
      : `, ${bucket.averageLatencyMs} ms average response`;
  return `${formatUptime(bucket.uptime)} uptime, ${checks}${latency}`;
}

export function UptimeBars({
  buckets,
  label,
}: {
  buckets: HourBucket[];
  label: string;
}) {
  return (
    <ol
      aria-label={label}
      className="flex h-10 min-w-0 items-stretch gap-0.5 overflow-hidden"
    >
      {buckets.map((bucket) => (
        <li
          key={bucket.start.toISOString()}
          data-slot="uptime-bar"
          data-state={bucket.state}
          className="flex min-w-0.5 flex-1"
        >
          <span className="sr-only">
            {formatUtcHourRange(bucket.start)}: {hourStateLabels[bucket.state]}.{" "}
            {hourSummary(bucket)}.
          </span>
          <Tooltip>
            <TooltipTrigger
              render={<span aria-hidden />}
              className={cn(
                "w-full rounded-xs transition-opacity hover:opacity-70",
                barColors[bucket.state],
              )}
            />
            <TooltipContent className="flex-col items-start gap-0.5">
              <span className="font-medium">
                {formatUtcHourRange(bucket.start)}
              </span>
              <span>
                {hourStateLabels[bucket.state]}
                {bucket.state === "no-data" ? "" : ` · ${hourSummary(bucket)}`}
              </span>
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ol>
  );
}

export function UptimeLegend() {
  const states: HourState[] = ["operational", "degraded", "outage", "no-data"];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {states.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-xs", barColors[state])}
          />
          {hourStateLabels[state]}
        </li>
      ))}
    </ul>
  );
}
