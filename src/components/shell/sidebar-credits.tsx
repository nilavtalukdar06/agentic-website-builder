"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditsCard } from "@/components/credits/credits-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/client";

export function SidebarCredits() {
  const trpc = useTRPC();
  const query = useQuery(trpc.credits.balance.queryOptions());

  if (query.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading credits"
        className="flex flex-col gap-3 rounded-lg border bg-card p-3"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm"
      >
        <span className="font-medium">Credits</span>
        <p className="text-xs text-muted-foreground">
          Couldn&apos;t load your balance.
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <CreditsCard balance={query.data.balance} allowance={query.data.granted} />
  );
}
