"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTRPC } from "@/trpc/client";

export function usePreview({
  projectId,
  building,
  hasVersion,
  savedPreviewUrl,
  livePreviewUrl,
}: {
  projectId: string;
  building: boolean;
  hasVersion: boolean;
  savedPreviewUrl: string | null;
  livePreviewUrl: string | null;
}) {
  const trpc = useTRPC();
  const wake = useMutation(trpc.sandbox.wake.mutationOptions());
  const { mutate } = wake;
  const shouldWake = !building && hasVersion;

  useEffect(() => {
    if (shouldWake) mutate({ projectId });
  }, [shouldWake, projectId, mutate]);

  const url =
    (wake.data?.status === "ready" ? wake.data.previewUrl : null) ??
    livePreviewUrl ??
    savedPreviewUrl;

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
    retryWake: () => mutate({ projectId }),
    hasVersion,
    building,
  };
}

export type PreviewState = ReturnType<typeof usePreview>;
