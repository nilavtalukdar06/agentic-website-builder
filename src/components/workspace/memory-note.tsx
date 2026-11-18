"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BrainIcon, CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import type { MemoryPart } from "@/lib/agent/parts";
import { useTRPC } from "@/trpc/client";

export function MemoryMatches({
  part,
  onConfirm,
  pending = false,
  done = false,
}: {
  part: MemoryPart;
  onConfirm: () => void;
  pending?: boolean;
  done?: boolean;
}) {
  if (part.status === "unavailable") {
    return (
      <Alert>
        <BrainIcon />
        <AlertTitle>Memory wasn’t changed</AlertTitle>
        <AlertDescription>
          {part.reason ?? "Memory is unavailable."}
        </AlertDescription>
      </Alert>
    );
  }
  if (part.action === "remember") {
    return (
      <Alert>
        <CircleCheckIcon />
        <AlertTitle>Remembered</AlertTitle>
        <AlertDescription className="break-words">{part.text}</AlertDescription>
      </Alert>
    );
  }
  if (part.matches.length === 0) return null;
  return (
    <div
      data-slot="memory-matches"
      className="flex min-w-0 flex-col gap-2 rounded-lg border p-3"
    >
      <ul
        aria-label="Memories to forget"
        className="flex min-w-0 flex-col gap-1.5"
      >
        {part.matches.map((match) => (
          <li
            key={`${match.scope}:${match.id}`}
            className="flex min-w-0 items-start gap-2 text-sm"
          >
            <Badge variant="outline" className="shrink-0">
              {match.scope === "project" ? "This project" : "All projects"}
            </Badge>
            <span className="min-w-0 break-words">{match.memory}</span>
          </li>
        ))}
      </ul>
      {done || part.status === "forgotten" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Forgotten.
        </p>
      ) : (
        <Button
          variant="destructive"
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Forget {part.matches.length === 1 ? "this" : "these"}
        </Button>
      )}
    </div>
  );
}

export function MemoryNote({
  part,
  projectId,
}: {
  part: MemoryPart;
  projectId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const forget = useMutation(
    trpc.memory.forget.mutationOptions({
      onSuccess: () => {
        setDone(true);
        void queryClient.invalidateQueries(trpc.memory.pathFilter());
        toast.add({ title: "Forgotten" });
      },
      onError: (error) =>
        toast.add({
          type: "error",
          title: "Couldn't forget that",
          description: error.message,
        }),
    }),
  );
  return (
    <MemoryMatches
      part={part}
      pending={forget.isPending}
      done={done}
      onConfirm={() =>
        forget.mutate({
          projectId,
          userIds: part.matches
            .filter((m) => m.scope === "user")
            .map((m) => m.id),
          projectIds: part.matches
            .filter((m) => m.scope === "project")
            .map((m) => m.id),
        })
      }
    />
  );
}
