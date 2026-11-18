"use client";

import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, InfoIcon } from "lucide-react";
import { ErrorState } from "@/components/states/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/client";

export type NotificationsPanelProps = {
  state:
    | { status: "loading" }
    | { status: "error"; onRetry: () => void }
    | {
        status: "ready";
        configured: boolean;
        enabled: boolean;
        email: string | null;
        limited: boolean;
      };
  onToggle: (enabled: boolean) => void;
  toggling?: boolean;
};

export function NotificationsPanel({
  state,
  onToggle,
  toggling = false,
}: NotificationsPanelProps) {
  const switchId = useId();

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading notifications"
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-4/5" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <ErrorState
        title="Couldn’t load your notifications"
        description="Check your connection and try again."
        onRetry={state.onRetry}
      />
    );
  }
  if (!state.configured) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyTitle>Email notifications aren’t available</EmptyTitle>
          <EmptyDescription>
            Email isn’t set up on this server yet, so Vibe can’t tell you when a
            build finishes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={switchId}>Email me about my builds</FieldLabel>
          <FieldDescription className="break-words">
            {state.email ? `Vibe emails ${state.email}` : "Vibe emails you"}{" "}
            when a build takes a while and finishes, fails or runs out of
            credits, and when a GitHub export finishes or fails.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={switchId}
          checked={state.enabled}
          disabled={toggling}
          onCheckedChange={(checked) => onToggle(checked)}
        />
      </Field>
      {state.limited ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Emails currently go out through a free test sender, so they may not
            reach every account yet.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function NotificationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...trpc.notifications.get.queryOptions(),
    enabled: open,
  });
  const setEnabled = useMutation(
    trpc.notifications.setEnabled.mutationOptions({
      onSuccess: (data) => {
        void queryClient.invalidateQueries(trpc.notifications.pathFilter());
        toast.add({
          title: data.enabled
            ? "Email notifications are on"
            : "Email notifications are off",
        });
      },
      onError: (error) =>
        toast.add({
          type: "error",
          title: "Couldn’t change the setting",
          description: error.message,
        }),
    }),
  );

  const state: NotificationsPanelProps["state"] = query.isPending
    ? { status: "loading" }
    : query.isError
      ? { status: "error", onRetry: () => void query.refetch() }
      : { status: "ready", ...query.data };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            Choose whether Vibe emails you about your builds.
          </DialogDescription>
        </DialogHeader>
        <NotificationsPanel
          state={state}
          toggling={setEnabled.isPending}
          onToggle={(enabled) => setEnabled.mutate({ enabled })}
        />
      </DialogContent>
    </Dialog>
  );
}
