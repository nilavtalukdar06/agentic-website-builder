"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "inngest/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceLive,
  emptyTracker,
  type LiveEvent,
} from "@/lib/agent/live-run";
import { projectChannelName, projectTopics } from "@/lib/agent/realtime-topics";
import { fetchRealtimeToken } from "@/lib/realtime-token";
import { useTRPC } from "@/trpc/client";

export function useRefreshWorkspace() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries(trpc.project.pathFilter()),
        queryClient.invalidateQueries(trpc.message.pathFilter()),
        queryClient.invalidateQueries(trpc.version.pathFilter()),
        queryClient.invalidateQueries(trpc.credits.pathFilter()),
        queryClient.invalidateQueries(trpc.github.pathFilter()),
      ]),
    [queryClient, trpc],
  );
}

export function useProjectRealtime(projectId: string, building: boolean) {
  const refresh = useRefreshWorkspace();
  const [runStart, setRunStart] = useState(0);
  const [seenBuilding, setSeenBuilding] = useState(building);
  if (building !== seenBuilding) {
    setSeenBuilding(building);
    if (building) setRunStart((count) => count + 1);
  }
  const realtime = useRealtime({
    channel: projectChannelName(projectId),
    topics: projectTopics.filter((topic) => topic !== "export"),
    token: () => fetchRealtimeToken(projectId),
    key: `${projectId}:${runStart}`,
    enabled: building,
    historyLimit: null,
    bufferInterval: 100,
    autoCloseOnTerminal: false,
  });

  const all = realtime.messages.all;
  const tracker = useMemo(() => {
    const events = all.filter(
      (message) => (message as { kind?: string }).kind === "data",
    ) as unknown as LiveEvent[];
    return advanceLive(emptyTracker(), events);
  }, [all]);

  const seenFinished = useRef(tracker.finished);
  useEffect(() => {
    if (tracker.finished > seenFinished.current) void refresh();
    seenFinished.current = tracker.finished;
  }, [tracker.finished, refresh]);

  const wasBuilding = useRef(building);
  useEffect(() => {
    if (wasBuilding.current && !building) void refresh();
    wasBuilding.current = building;
  }, [building, refresh]);

  return {
    live: tracker.run,
    previewUrl: tracker.run.previewUrl ?? tracker.lastPreview,
    connected: realtime.connectionStatus === "open",
  };
}
