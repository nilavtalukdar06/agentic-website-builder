"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/client";
import { useRefreshWorkspace } from "./use-project-realtime";

export function useRestoreVersion() {
  const trpc = useTRPC();
  const refresh = useRefreshWorkspace();
  return useMutation(
    trpc.version.restore.mutationOptions({
      onSuccess: async ({ number, sandboxUpdated }) => {
        await refresh();
        toast.add({
          title: `Restored as version ${number}`,
          description: sandboxUpdated
            ? "The preview now shows the restored files."
            : "The preview rebuilds from it the next time it starts.",
        });
      },
      onError: (error) =>
        toast.add({
          type: "error",
          title: "Couldn't restore that version",
          description: error.message || "Try again in a moment.",
        }),
    }),
  );
}
