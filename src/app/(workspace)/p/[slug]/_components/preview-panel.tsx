"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenIcon,
  BoxIcon,
  BrainIcon,
  GlobeIcon,
  HammerIcon,
  ListChecksIcon,
  MousePointerClickIcon,
  type LucideIcon,
  MonitorCheckIcon,
  MonitorOffIcon,
  PackageIcon,
  RocketIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { Terminal } from "@/components/ai-elements/terminal";
import {
  WebPreview,
  WebPreviewBody,
} from "@/components/ai-elements/web-preview";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  type GeneratingFile,
  GeneratingOverlay,
} from "@/components/workspace/generating-overlay";
import {
  consoleLines,
  type LiveRun,
  type LiveStep,
  type LiveStepKind,
} from "@/lib/agent/live-run";
import type { PreviewDevice } from "@/lib/search-params/workspace";
import { BrowserSession } from "@/components/workspace/browser-session";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import type { PreviewState } from "./use-preview";

const deviceWidths: Record<PreviewDevice, string> = {
  desktop: "w-full",
  tablet: "w-192 max-w-full border-x",
  mobile: "w-[390px] max-w-full border-x",
};

const OVERLAY_ROWS = 7;

const stepIcons: Record<LiveStepKind, LucideIcon | undefined> = {
  thinking: BrainIcon,
  sandbox: BoxIcon,
  skill: SparklesIcon,
  read: BookOpenIcon,
  install: PackageIcon,
  file: undefined,
  delete: Trash2Icon,
  command: TerminalIcon,
  search: GlobeIcon,
  guard: ShieldAlertIcon,
  compile: HammerIcon,
  preview: MonitorCheckIcon,
  note: ListChecksIcon,
  browser: MousePointerClickIcon,
};

const startingRow: GeneratingFile = {
  id: "starting",
  path: "",
  verb: "Starting the agent",
  status: "active",
  icon: RocketIcon,
};

export function overlaySteps(steps: readonly LiveStep[]): GeneratingFile[] {
  if (steps.length === 0) return [startingRow];
  return steps.slice(-OVERLAY_ROWS).map((step) => ({
    id: step.id,
    path: step.detail ?? "",
    verb: step.label,
    status: step.status,
    icon: step.kind === "file" ? undefined : stepIcons[step.kind],
    mono: step.kind !== "search" && step.kind !== "sandbox",
  }));
}

function useElapsedSeconds(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const timer = setInterval(
      () => setElapsed((Date.now() - startedAt) / 1000),
      1000,
    );
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [running]);
  return running ? elapsed : 0;
}

function WakingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Waking up the preview"
      className="relative flex size-full flex-col gap-6 p-12"
    >
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-48 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <p className="absolute inset-x-0 bottom-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Waking up the preview…
      </p>
    </div>
  );
}

export function PreviewPanel({
  projectId,
  preview,
  device,
  live,
}: {
  projectId: string;
  preview: PreviewState;
  device: PreviewDevice;
  live: LiveRun;
}) {
  const trpc = useTRPC();
  const { building, hasVersion, url } = preview;
  const elapsed = useElapsedSeconds(building);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const messages = useQuery(trpc.message.list.queryOptions({ projectId }));

  const logs = useMemo(() => {
    if (building) return consoleLines(live.tools);
    const lastReply = messages.data?.messages.findLast(
      (message) =>
        message.role === "ASSISTANT" &&
        message.parts.some((part) => part.type === "tool"),
    );
    const tools = (lastReply?.parts ?? []).flatMap((part) =>
      part.type === "tool"
        ? [{ ...part, done: true, command: part.command || null }]
        : [],
    );
    return consoleLines(tools);
  }, [building, live.tools, messages.data]);

  let body: React.ReactNode;
  if (building && live.browser?.open) {
    body = <BrowserSession browser={live.browser} />;
  } else if (building) {
    body = (
      <GeneratingOverlay
        files={overlaySteps(live.steps)}
        elapsedSeconds={elapsed}
        caption={
          hasVersion
            ? "The preview reloads when this version is saved"
            : "Preview loads after the first compile"
        }
      />
    );
  } else if (!hasVersion) {
    body = (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MonitorOffIcon />
          </EmptyMedia>
          <EmptyTitle>No preview yet</EmptyTitle>
          <EmptyDescription>
            The preview appears once the agent saves the first version. Send a
            message to start building.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (preview.wakeError) {
    body = (
      <ErrorState
        title="Couldn't wake the preview"
        description={preview.wakeError}
        onRetry={preview.retryWake}
        className="size-full"
      />
    );
  } else if (preview.waking || !url) {
    body = <WakingSkeleton />;
  } else {
    body = (
      <div className="flex size-full justify-center overflow-auto bg-muted/30">
        <div
          className={cn(
            "flex h-full flex-col overflow-auto bg-background",
            deviceWidths[device],
          )}
        >
          <WebPreviewBody
            key={preview.reloadKey}
            src={url}
            title="Site preview"
            className="bg-background"
          />
        </div>
      </div>
    );
  }

  return (
    <WebPreview
      defaultUrl={url ?? ""}
      className="relative size-full rounded-none border-0 bg-background"
    >
      <div className="relative min-h-0 flex-1">{body}</div>
      {consoleOpen ? (
        <div className="absolute inset-x-3 bottom-16 z-10">
          <Terminal
            output={
              logs.length > 0
                ? logs.map((line) => line.message).join("\n")
                : "No console output yet."
            }
            isStreaming={building}
            className="max-h-64 bg-popover"
          />
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          aria-expanded={consoleOpen}
          className="rounded-full bg-popover"
          onClick={() => setConsoleOpen((open) => !open)}
        >
          <TerminalIcon data-icon="inline-start" />
          Console
          {logs.length > 0 ? (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {logs.length}
            </span>
          ) : null}
        </Button>
      </div>
    </WebPreview>
  );
}
