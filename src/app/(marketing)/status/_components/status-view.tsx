"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ActivityIcon,
  CircleCheckIcon,
  CircleXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useQueryStates } from "nuqs";
import { ErrorState } from "@/components/states/error-state";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { statusSearchParams } from "@/lib/search-params/status";
import {
  CHECK_INTERVAL_MINUTES,
  formatUptime,
  formatUtcDay,
  formatUtcTime,
  type OverallStatus,
  overallStatusCopy,
  type StatusRange,
  statusRangeLabels,
  statusRanges,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { UptimeBars, UptimeLegend } from "./uptime-bars";

export const STATUS_REFETCH_MS = 60_000;

const statusIcons = {
  operational: { icon: CircleCheckIcon, className: "text-success" },
  degraded: { icon: TriangleAlertIcon, className: "text-warning" },
  outage: { icon: CircleXIcon, className: "text-destructive" },
} satisfies Record<
  OverallStatus,
  { icon: React.ComponentType<React.ComponentProps<"svg">>; className: string }
>;

function PageHeading() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-page-title">Status</h1>
      <p className="text-body text-muted-foreground">
        Uptime of the Vibe application, checked every {CHECK_INTERVAL_MINUTES}{" "}
        minutes and grouped by hour. All times are UTC.
      </p>
    </header>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card data-slot="stat" className="gap-1">
      <CardContent className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-caption text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  );
}

export function StatusSkeleton({
  withHeading = true,
}: {
  withHeading?: boolean;
}) {
  return (
    <div
      data-slot="status-skeleton"
      aria-hidden
      className="flex flex-col gap-6"
    >
      {withHeading ? <PageHeading /> : null}
      <Skeleton className="h-18 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function StatusEmpty() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ActivityIcon />
        </EmptyMedia>
        <EmptyTitle>No checks recorded yet</EmptyTitle>
        <EmptyDescription>
          Uptime appears here after the first health check runs. Check back in a
          few minutes.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function StatusView() {
  const trpc = useTRPC();
  const [{ range }, setParams] = useQueryStates(statusSearchParams);
  const query = useQuery({
    ...trpc.status.uptime.queryOptions({ range }),
    placeholderData: keepPreviousData,
    refetchInterval: STATUS_REFETCH_MS,
  });

  const data = query.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading />
      {query.isError && !data ? (
        <ErrorState
          title="Couldn't load the status"
          description="We couldn't read the latest health checks. Try again in a moment."
          onRetry={() => query.refetch()}
        />
      ) : !data ? (
        <StatusSkeleton withHeading={false} />
      ) : !data.hasData ? (
        <StatusEmpty />
      ) : (
        <>
          <Card data-slot="status-banner" data-status={data.status}>
            <CardContent className="flex items-center gap-3">
              {(() => {
                const { icon: Icon, className } = statusIcons[data.status];
                return <Icon className={cn("size-6 shrink-0", className)} />;
              })()}
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-card-title">
                  {overallStatusCopy[data.status].title}
                </h2>
                <p className="text-caption text-muted-foreground">
                  {overallStatusCopy[data.status].description}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Uptime"
              value={formatUptime(data.uptime)}
              hint={`last ${statusRangeLabels[data.range]}`}
            />
            <Stat
              label="Average response"
              value={
                data.averageLatencyMs === null
                  ? "—"
                  : `${data.averageLatencyMs} ms`
              }
              hint="database round trip"
            />
            <Stat
              label="Last check"
              value={`${formatUtcTime(data.lastCheckedAt)} UTC`}
              hint={formatUtcDay(data.lastCheckedAt)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hourly uptime</CardTitle>
              <CardDescription>
                One bar per hour. Hover a bar for details.
              </CardDescription>
              <CardAction>
                <Tabs
                  value={range}
                  onValueChange={(value: StatusRange) =>
                    setParams({ range: value === "24h" ? null : value })
                  }
                >
                  <TabsList aria-label="Time range">
                    {statusRanges.map((value) => (
                      <TabsTrigger key={value} value={value}>
                        {statusRangeLabels[value]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <UptimeBars
                buckets={data.buckets}
                label={`Hourly uptime for the last ${statusRangeLabels[data.range]}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{statusRangeLabels[data.range]} ago</span>
                <span>Now</span>
              </div>
              <UptimeLegend />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
