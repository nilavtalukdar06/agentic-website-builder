"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "inngest/react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { isExportActive } from "@/lib/github-export";
import { projectChannelName } from "@/lib/agent/realtime-topics";
import { fetchRealtimeToken } from "@/lib/realtime-token";
import { useTRPC } from "@/trpc/client";

export function useGithubExport(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const status = useQuery({
    ...trpc.github.status.queryOptions({ projectId }),
    refetchInterval: (query) =>
      query.state.data?.busy || isExportActive(query.state.data?.job?.status)
        ? 2000
        : false,
  });
  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries(
          trpc.github.status.queryFilter({ projectId }),
        ),
        queryClient.invalidateQueries(trpc.project.pathFilter()),
      ]),
    [projectId, queryClient, trpc],
  );
  const active = isExportActive(status.data?.job?.status);
  const realtime = useRealtime({
    channel: projectChannelName(projectId),
    topics: ["export"],
    token: () => fetchRealtimeToken(projectId),
    key: `${projectId}:export`,
    enabled: active,
    historyLimit: null,
    bufferInterval: 100,
    autoCloseOnTerminal: false,
  });
  const count = realtime.messages.all.length;
  useEffect(() => {
    if (count) void refresh();
  }, [count, refresh]);
  const previous = useRef<{ id: string; active: boolean } | null>(null);
  const job = status.data?.job;
  useEffect(() => {
    if (
      job &&
      previous.current?.id === job.id &&
      previous.current.active &&
      !isExportActive(job.status)
    ) {
      if (job.status === "SUCCEEDED")
        toast.add({
          title: "Pushed to GitHub",
          description: job.repository ?? undefined,
        });
      void queryClient.invalidateQueries(trpc.project.pathFilter());
    }
    previous.current = job
      ? { id: job.id, active: isExportActive(job.status) }
      : null;
  }, [job, queryClient, trpc]);
  const start = useMutation(
    trpc.github.start.mutationOptions({ onSuccess: refresh, onError: refresh }),
  );
  const retry = useMutation(
    trpc.github.retry.mutationOptions({ onSuccess: refresh, onError: refresh }),
  );
  return {
    status,
    active,
    start,
    retry,
    refresh,
    pending: start.isPending || retry.isPending,
  };
}

export type GithubExportState = ReturnType<typeof useGithubExport>;
