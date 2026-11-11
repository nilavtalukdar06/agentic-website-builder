import { z } from "zod";
import {
  buildHourlyBuckets,
  overallStatus,
  startOfHour,
  statusRangeHours,
  statusRanges,
  summarizeBuckets,
} from "@/lib/status";
import { createTRPCRouter, publicProcedure } from "../init";

const HOUR_MS = 60 * 60 * 1000;

export const statusRouter = createTRPCRouter({
  uptime: publicProcedure
    .input(
      z
        .object({ range: z.enum(statusRanges).default("24h") })
        .default({ range: "24h" }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const hours = statusRangeHours[input.range];
      const since = new Date(
        startOfHour(now).getTime() - (hours - 1) * HOUR_MS,
      );

      const [checks, first, latest] = await Promise.all([
        ctx.db.healthCheck.findMany({
          where: { checkedAt: { gte: since } },
          select: { checkedAt: true, ok: true, latencyMs: true },
          orderBy: { checkedAt: "asc" },
        }),
        ctx.db.healthCheck.aggregate({ _min: { checkedAt: true } }),
        ctx.db.healthCheck.findFirst({
          orderBy: { checkedAt: "desc" },
          select: { checkedAt: true, ok: true, latencyMs: true },
        }),
      ]);

      if (!latest) {
        return { hasData: false as const, range: input.range, now };
      }

      const buckets = buildHourlyBuckets({
        checks,
        hours,
        now,
        firstCheckAt: first._min.checkedAt,
      });
      const { uptime, averageLatencyMs } = summarizeBuckets(buckets);
      const lastHour = buckets[buckets.length - 1];
      const previousHour = buckets[buckets.length - 2];
      const lastHourUptime =
        lastHour.expected > 0
          ? lastHour.uptime
          : (previousHour?.uptime ?? null);

      return {
        hasData: true as const,
        range: input.range,
        now,
        buckets,
        uptime,
        averageLatencyMs,
        lastCheckedAt: latest.checkedAt,
        status: overallStatus({ latest, lastHourUptime, now }),
      };
    }),
});
