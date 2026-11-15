"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/client";

export function useDeleteProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation(
    trpc.project.delete.mutationOptions({
      onSuccess: async () => {
        router.replace("/projects");
        await Promise.all([
          queryClient.invalidateQueries(trpc.project.list.pathFilter()),
          queryClient.invalidateQueries(trpc.project.recent.pathFilter()),
        ]);
        toast.add({
          title: "Project deleted",
          description:
            "Its chat, versions, images and preview sandbox were removed.",
        });
      },
    }),
  );
}
