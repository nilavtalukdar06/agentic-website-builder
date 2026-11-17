"use client";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usageSearchParams } from "@/lib/search-params/usage";
import { useTRPC } from "@/trpc/client";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const number = (value: number) => value.toLocaleString("en-US");
const date = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);

export function UsageView() {
  const [params, setParams] = useQueryStates(usageSearchParams);
  const page = Math.max(1, params.page);
  const [amount, setAmount] = useState(25);
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.credits.usage.queryOptions({ range: params.range, page }),
  );
  const checkout = useMutation(
    trpc.credits.checkout.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.assign(url);
      },
    }),
  );
  const days = params.range === "14d" ? 14 : 30;
  const now = new Date();
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days + 1,
  );
  const chart = Array.from({ length: days }, (_, i) => {
    const day = new Date(start + i * 86400000);
    const key = day.toISOString().slice(0, 10);
    return {
      day: key,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(day),
      credits: data.daily
        .filter((row) => row.createdAt.toISOString().slice(0, 10) === key)
        .reduce((sum, row) => sum - row.delta, 0),
    };
  });
  const projectNames = new Map(
    data.projects.map((project) => [project.id, project.name]),
  );
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-medium tracking-tight">
          Usage &amp; credits
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay as you go. Top up any amount from $5 to $100.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          title="Balance"
          value={number(data.balance)}
          detail="credits available"
        />
        <Stat
          title="Used this month"
          value={number(data.used)}
          detail="credits used"
        />
        <Stat
          title="Last top-up"
          value={data.latest ? money(data.latest.amountCents) : "—"}
          detail={data.latest ? date(data.latest.createdAt) : "No top-ups yet"}
        />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Daily usage</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Credits spent over the last {days} days
                </p>
              </div>
              <ToggleGroup
                aria-label="Usage range"
                variant="outline"
                size="sm"
                value={[params.range]}
                onValueChange={(v) => {
                  if (v[0] === "14d" || v[0] === "30d")
                    void setParams({ range: v[0] });
                }}
              >
                <ToggleGroupItem value="14d">14d</ToggleGroupItem>
                <ToggleGroupItem value="30d">30d</ToggleGroupItem>
              </ToggleGroup>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  credits: { label: "Credits", color: "var(--chart-2)" },
                }}
                className="h-48 w-full"
              >
                <BarChart data={chart} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="credits"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.activity.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground">
                        {date(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        {row.projectId
                          ? (projectNames.get(row.projectId) ??
                            "Deleted project")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {
                          (
                            {
                              TOPUP: "Top-up",
                              GENERATION: "Generation",
                              EDIT: "Edit",
                              REFUND: "Refund",
                              ADJUSTMENT: "Adjustment",
                            } as const
                          )[row.reason]
                        }
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.delta > 0 ? "+" : ""}
                        {number(row.delta)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.activity.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No credit activity yet.
                </p>
              )}
              <div className="flex justify-end gap-2 px-6 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => void setParams({ page: page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * 10 >= data.count}
                  onClick={() => void setParams({ page: page + 1 })}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card id="top-up">
          <CardHeader>
            <CardTitle>Top up credits</CardTitle>
            <p className="text-sm text-muted-foreground">
              One-time payment in USD. Minimum $5, maximum $100.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleGroup
              className="w-full"
              variant="outline"
              spacing={0}
              value={[String(amount)]}
              onValueChange={(v) => {
                if (v[0]) setAmount(Number(v[0]));
              }}
              aria-label="Top-up amount"
            >
              {[5, 10, 25, 50, 100].map((value) => (
                <ToggleGroupItem
                  className="flex-1"
                  value={String(value)}
                  key={value}
                >
                  ${value}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Amount</span>
                <span>{money(amount * 100)}</span>
              </div>
              <Slider
                aria-label="Amount in dollars"
                min={5}
                max={100}
                step={1}
                value={amount}
                onValueChange={(value) =>
                  setAmount(Array.isArray(value) ? value[0] : value)
                }
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$5</span>
                <span>$100</span>
              </div>
            </div>
            <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credits</span>
                <span>{number(amount * data.rate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rate</span>
                <span>$1 = {number(data.rate)} credits</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance after</span>
                <span>{number(data.balance + amount * data.rate)}</span>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={checkout.isPending}
              onClick={() => checkout.mutate({ amount })}
            >
              {checkout.isPending
                ? "Opening checkout…"
                : `Pay ${money(amount * 100)}`}
            </Button>
            {checkout.isError && (
              <p role="alert" className="text-sm text-destructive">
                {checkout.error.message}
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Credits are added as soon as the payment clears.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function Stat({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
