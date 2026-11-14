"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/client";

export function usePreview({
  projectId,
  building,
  version,
  savedPreviewUrl,
  livePreviewUrl,
  busy = false,
}: {
  projectId: string;
  building: boolean;
  version: number | null;
  savedPreviewUrl: string | null;
  livePreviewUrl: string | null;
  busy?: boolean;
}) {
  const trpc = useTRPC();
  const wake = useMutation(trpc.sandbox.wake.mutationOptions());
  const { mutate } = wake;
  const hasVersion = version !== null;
  const shouldWake = !building && hasVersion && !busy;
  const woken = useRef<string | null>(null);
  const [resolved, setResolved] = useState<{
    version: number | null;
    source: string | null;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    const key = `${projectId}:${version}`;
    if (shouldWake && woken.current !== key) {
      woken.current = key;
      mutate(
        { projectId },
        {
          onSuccess: (data) => {
            if (data.status === "ready")
              setResolved({
                version,
                source: savedPreviewUrl,
                url: data.previewUrl,
              });
          },
        },
      );
    }
  }, [shouldWake, projectId, version, savedPreviewUrl, mutate]);

  const currentWake =
    resolved?.version === version &&
    (resolved.source === savedPreviewUrl || resolved.url === savedPreviewUrl)
      ? resolved.url
      : null;
  const url = building
    ? (livePreviewUrl ?? savedPreviewUrl)
    : (currentWake ?? savedPreviewUrl ?? livePreviewUrl);

  const [reloadKey, setReloadKey] = useState(0);
  const [shownUrl, setShownUrl] = useState(url);
  if (url !== shownUrl) {
    setShownUrl(url);
    setReloadKey((key) => key + 1);
  }

  return {
    url,
    reloadKey,
    reload: () => setReloadKey((key) => key + 1),
    waking: shouldWake && (wake.isPending || wake.isIdle),
    wakeError: shouldWake && wake.isError ? wake.error.message : null,
    retryWake: () =>
      mutate(
        { projectId },
        {
          onSuccess: (data) => {
            if (data.status === "ready")
              setResolved({
                version,
                source: savedPreviewUrl,
                url: data.previewUrl,
              });
          },
        },
      ),
    hasVersion,
    building,
  };
}

export type PreviewState = ReturnType<typeof usePreview>;
