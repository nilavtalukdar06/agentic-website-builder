"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilLineIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/client";

export function UnsavedEditsBar({
  projectId,
  locked,
}: {
  projectId: string;
  locked: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.version.pathFilter()),
      queryClient.invalidateQueries(trpc.message.pathFilter()),
      queryClient.invalidateQueries(trpc.project.pathFilter()),
    ]);
  const fail = (title: string) => (error: { message: string }) =>
    toast.add({ type: "error", title, description: error.message });

  const save = useMutation(
    trpc.code.saveVersion.mutationOptions({
      onSuccess: (data) => {
        void refresh();
        toast.add({
          title: data.number
            ? `Saved as version ${data.number}`
            : "Nothing to save",
        });
      },
      onError: fail("Couldn’t save the version"),
    }),
  );
  const discard = useMutation(
    trpc.code.discard.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        void refresh();
        toast.add({ title: "Edits discarded" });
      },
      onError: fail("Couldn’t discard the edits"),
    }),
  );

  return (
    <>
      <div
        role="status"
        className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b bg-brand-soft px-3 py-1.5 text-sm text-brand-text"
      >
        <PencilLineIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          You have unsaved edits. The preview shows them, but they aren’t a
          version yet.
        </span>
        <Button
          size="sm"
          disabled={locked || save.isPending}
          onClick={() => save.mutate({ projectId })}
        >
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save version
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked || discard.isPending}
          onClick={() => setConfirming(true)}
        >
          Discard
        </Button>
      </div>
      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!discard.isPending) setConfirming(next);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard your edits?</DialogTitle>
            <DialogDescription>
              The preview goes back to the last saved version. This can’t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={discard.isPending}
              onClick={() => setConfirming(false)}
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={discard.isPending}
              onClick={() => discard.mutate({ projectId })}
            >
              {discard.isPending ? <Spinner data-icon="inline-start" /> : null}
              Discard edits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
