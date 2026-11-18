"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainIcon, Trash2Icon } from "lucide-react";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/client";

export type MemoryEntry = {
  id: string;
  memory: string;
  kind: "static" | "dynamic" | "match";
};

export type MemoryPanelProps = {
  state:
    | { status: "loading" }
    | { status: "error"; onRetry: () => void }
    | {
        status: "ready";
        configured: boolean;
        enabled: boolean;
        items: MemoryEntry[];
      };
  onToggle: (enabled: boolean) => void;
  onForget: (id: string) => void;
  onClear: () => void;
  toggling?: boolean;
  forgettingId?: string | null;
};

export function MemoryPanel({
  state,
  onToggle,
  onForget,
  onClear,
  toggling = false,
  forgettingId = null,
}: MemoryPanelProps) {
  const switchId = useId();

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading memory"
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-3/5" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <ErrorState
        title="Couldn't load your memory"
        description="Memory didn't answer. Check your connection and try again."
        onRetry={state.onRetry}
      />
    );
  }
  if (!state.configured) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BrainIcon />
          </EmptyMedia>
          <EmptyTitle>Memory isn’t available</EmptyTitle>
          <EmptyDescription>
            Memory isn’t set up on this server yet, so Vibe doesn’t remember
            anything between projects.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={switchId}>Use memory</FieldLabel>
          <FieldDescription>
            Vibe learns your preferences from your own messages and uses them in
            new projects. It never saves what websites or files say.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={switchId}
          checked={state.enabled}
          disabled={toggling}
          onCheckedChange={(checked) => onToggle(checked)}
        />
      </Field>
      {state.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BrainIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing remembered yet</EmptyTitle>
            <EmptyDescription>
              Say “remember that I prefer…” in any project, or just describe
              what you like. Preferences can take a few minutes to appear.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-medium">What Vibe remembers</p>
          <ul
            aria-label="What Vibe remembers"
            className="flex max-h-72 min-w-0 flex-col divide-y overflow-y-auto rounded-lg border"
          >
            {state.items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 items-start gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 break-words">
                  {item.memory}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Forget: ${item.memory}`}
                  disabled={forgettingId === item.id}
                  onClick={() => onForget(item.id)}
                >
                  {forgettingId === item.id ? <Spinner /> : <Trash2Icon />}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onClear}
          >
            Clear all memory
          </Button>
        </div>
      )}
    </div>
  );
}

export function MemoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const list = useQuery({ ...trpc.memory.list.queryOptions(), enabled: open });
  const refresh = () => queryClient.invalidateQueries(trpc.memory.pathFilter());
  const fail = (title: string) => (error: { message: string }) =>
    toast.add({ type: "error", title, description: error.message });

  const setEnabled = useMutation(
    trpc.memory.setEnabled.mutationOptions({
      onSuccess: (data) => {
        void refresh();
        toast.add({
          title: data.enabled ? "Memory is on" : "Memory is off",
        });
      },
      onError: fail("Couldn't change the setting"),
    }),
  );
  const forget = useMutation(
    trpc.memory.forget.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast.add({ title: "Forgotten" });
      },
      onError: fail("Couldn't forget that"),
    }),
  );
  const clear = useMutation(
    trpc.memory.clear.mutationOptions({
      onSuccess: () => {
        setConfirmOpen(false);
        void refresh();
        toast.add({ title: "Memory cleared" });
      },
      onError: fail("Couldn't clear your memory"),
    }),
  );

  const state: MemoryPanelProps["state"] = list.isPending
    ? { status: "loading" }
    : list.isError
      ? { status: "error", onRetry: () => void list.refetch() }
      : { status: "ready", ...list.data };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Memory</DialogTitle>
            <DialogDescription>
              What Vibe remembers about you across projects.
            </DialogDescription>
          </DialogHeader>
          <MemoryPanel
            state={state}
            toggling={setEnabled.isPending}
            forgettingId={
              forget.isPending ? (forget.variables?.userIds?.[0] ?? null) : null
            }
            onToggle={(enabled) => setEnabled.mutate({ enabled })}
            onForget={(id) => forget.mutate({ userIds: [id], projectIds: [] })}
            onClear={() => setConfirmOpen(true)}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!clear.isPending) setConfirmOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear all memory?</DialogTitle>
            <DialogDescription>
              Vibe forgets your preferences and everything it remembered in your
              projects. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={clear.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              {clear.isPending ? <Spinner data-icon="inline-start" /> : null}
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
