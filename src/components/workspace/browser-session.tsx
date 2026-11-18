"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  MonitorIcon,
  MousePointerClickIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { LiveBrowser } from "@/lib/agent/live-run";
import type {
  BrowserCheck,
  BrowserPart,
  BrowserViewport,
} from "@/lib/agent/parts";
import { cn } from "@/lib/utils";

export const viewportLabels: Record<BrowserViewport, string> = {
  desktop: "Desktop · 1280",
  phone: "Phone · 390",
};

const viewportIcons = { desktop: MonitorIcon, phone: SmartphoneIcon };

function StatusIcon({ status }: { status: BrowserCheck["status"] }) {
  if (status === "running") {
    return <Spinner aria-label="Running" className="mt-0.5 shrink-0" />;
  }
  if (status === "passed") {
    return (
      <CircleCheckIcon
        aria-label="Passed"
        className="mt-0.5 size-4 shrink-0 text-success"
      />
    );
  }
  return (
    <CircleXIcon
      aria-label="Failed"
      className="mt-0.5 size-4 shrink-0 text-destructive"
    />
  );
}

export function BrowserCheckRow({ check }: { check: BrowserCheck }) {
  const ViewportIcon = viewportIcons[check.viewport];
  return (
    <TaskItem className="flex items-start gap-2">
      <StatusIcon status={check.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground">{check.label}</span>
          <Badge variant="outline" className="gap-1 font-normal">
            <ViewportIcon data-icon="inline-start" aria-hidden />
            {check.viewport === "phone" ? "Phone" : "Desktop"}
          </Badge>
        </div>
        {check.detail && check.status !== "running" ? (
          <p
            className={cn(
              "text-xs break-words",
              check.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {check.detail}
          </p>
        ) : null}
      </div>
    </TaskItem>
  );
}

export function BrowserCheckList({
  checks,
  title,
  defaultOpen = true,
  emptyLabel = "Waiting for the first page to open…",
}: {
  checks: readonly BrowserCheck[];
  title: string;
  defaultOpen?: boolean;
  emptyLabel?: string;
}) {
  return (
    <Task defaultOpen={defaultOpen}>
      <TaskTrigger title={title} className="w-full min-w-0">
        <div className="flex w-full cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <MousePointerClickIcon className="size-4" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-left">{title}</p>
          <ChevronDownIcon className="size-4 transition-transform group-data-panel-open:rotate-180" />
        </div>
      </TaskTrigger>
      <TaskContent>
        {checks.length === 0 ? (
          <TaskItem>{emptyLabel}</TaskItem>
        ) : (
          checks.map((check) => (
            <BrowserCheckRow key={check.id} check={check} />
          ))
        )}
      </TaskContent>
    </Task>
  );
}

function currentCheck(checks: readonly BrowserCheck[]) {
  return (
    [...checks].reverse().find((check) => check.status === "running") ??
    checks.at(-1) ??
    null
  );
}

export function browserEmbedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://www.browserbase.com" ||
      url.username ||
      url.password ||
      !/^\/devtools-fullscreen(?:\/|$)/.test(url.pathname)
    )
      return null;
    url.searchParams.set("navbar", "false");
    return url.href;
  } catch {
    return null;
  }
}

export function LiveBrowserView(props: {
  liveUrl: string | null;
  className?: string;
}) {
  return <BrowserFrame key={props.liveUrl} {...props} />;
}

function BrowserFrame({
  liveUrl,
  className,
}: {
  liveUrl: string | null;
  className?: string;
}) {
  const [disconnected, setDisconnected] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const embedUrl = browserEmbedUrl(liveUrl);

  useEffect(() => {
    if (!embedUrl) return;
    const origin = new URL(embedUrl).origin;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === frame.current?.contentWindow &&
        event.data === "browserbase-disconnected"
      ) {
        setDisconnected(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedUrl]);

  if (!liveUrl) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center bg-muted/40",
          className,
        )}
      >
        <Skeleton className="absolute inset-4" />
        <p className="relative flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Connecting to the browser…
        </p>
      </div>
    );
  }
  if (disconnected || !embedUrl) {
    return (
      <Empty className={cn("bg-muted/40", className)}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WifiOffIcon />
          </EmptyMedia>
          <EmptyTitle>The live view is unavailable</EmptyTitle>
          <EmptyDescription>
            The checks keep running, and their results appear in the list.
          </EmptyDescription>
        </EmptyHeader>
        {embedUrl ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisconnected(false)}
          >
            Reconnect live view
          </Button>
        ) : null}
      </Empty>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-muted/40", className)}>
      <iframe
        ref={frame}
        src={embedUrl}
        inert
        tabIndex={-1}
        referrerPolicy="no-referrer"
        onError={() => setDisconnected(true)}
        title="Live view of the agent's browser"
        sandbox="allow-same-origin allow-scripts"
        className="pointer-events-none absolute inset-0 size-full border-0"
      />
    </div>
  );
}

export function BrowserSession({ browser }: { browser: LiveBrowser }) {
  const current = currentCheck(browser.checks);
  const passed = browser.checks.filter(
    (check) => check.status === "passed",
  ).length;
  const failed = browser.checks.filter(
    (check) => check.status === "failed",
  ).length;

  return (
    <section
      aria-label="Checking the site in a cloud browser"
      data-slot="browser-session"
      className="flex size-full min-h-0 flex-col bg-background md:flex-row"
    >
      <div className="flex min-h-0 min-w-0 shrink-0 flex-col md:flex-1">
        <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2">
          <Badge variant="outline" className="shrink-0 gap-1.5">
            <span
              aria-hidden
              className="size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
            />
            Live · Read-only
          </Badge>
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {current ? current.route : "/"}
          </p>
          {current ? (
            <Badge variant="secondary" className="shrink-0">
              {viewportLabels[current.viewport]}
            </Badge>
          ) : null}
        </div>
        <LiveBrowserView
          liveUrl={browser.liveUrl}
          className="aspect-[16/10] w-full shrink-0 md:aspect-auto md:min-h-0 md:flex-1"
        />
      </div>
      <aside
        aria-label="Browser checks"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t p-4 md:w-80 md:flex-none md:border-t-0 md:border-l lg:w-96"
      >
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <span>{passed} passed</span>
          <span aria-hidden>·</span>
          <span className={cn(failed > 0 && "text-destructive")}>
            {failed} failed
          </span>
          {browser.round > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>re-check {browser.round}</span>
            </>
          ) : null}
        </div>
        <BrowserCheckList
          checks={browser.checks}
          title="The agent is checking the site"
        />
      </aside>
    </section>
  );
}

function ScreenshotThumb({
  viewport,
  url,
}: {
  viewport: BrowserViewport;
  url: string;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = viewport === "phone" ? "Phone" : "Desktop";
  if (failed) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {label} screenshot unavailable. Reopen the project to refresh the link;
        screenshots expire after 30 days.
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group/shot relative overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          viewport === "phone"
            ? "aspect-[390/844] w-20"
            : "aspect-[16/10] w-40",
        )}
      >
        <Image
          src={url}
          onError={() => setFailed(true)}
          alt={`${label} screenshot of the home page`}
          fill
          unoptimized
          sizes="160px"
          className="object-cover object-top transition-transform group-hover/shot:scale-105"
        />
        <span className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-0.5 text-left text-[11px] text-foreground">
          {label}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label} screenshot</DialogTitle>
            <DialogDescription>
              The home page as the agent’s browser saw it after the build.
            </DialogDescription>
          </DialogHeader>
          <Image
            src={url}
            onError={() => setFailed(true)}
            alt={`${label} screenshot of the home page`}
            width={viewport === "phone" ? 390 : 1280}
            height={viewport === "phone" ? 844 : 800}
            unoptimized
            className={cn(
              "mx-auto h-auto rounded-lg border",
              viewport === "phone" ? "w-full max-w-xs" : "w-full",
            )}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BrowserReport({ part }: { part: BrowserPart }) {
  if (part.status === "skipped") {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>The browser check didn’t run</AlertTitle>
        <AlertDescription>
          {part.reason
            ? `${part.reason.charAt(0).toUpperCase()}${part.reason.slice(1)}.`
            : "The build was checked with types, lint and page loads only."}
        </AlertDescription>
      </Alert>
    );
  }
  const failed = part.checks.filter(
    (check) => check.status === "failed",
  ).length;
  const shots = part.screenshots.filter(
    (shot): shot is typeof shot & { url: string } => !!shot.url,
  );
  return (
    <div data-slot="browser-report" className="flex flex-col gap-3">
      <BrowserCheckList
        checks={part.checks}
        defaultOpen={failed > 0 || part.checks.length === 0}
        emptyLabel="No browser check results were saved."
        title={
          part.checks.length === 0
            ? "No saved browser checks"
            : failed > 0
              ? `Checked in the browser: ${failed} still failing`
              : part.status === "failed"
                ? "The browser check did not finish successfully"
                : `Checked in the browser: ${part.checks.filter((check) => check.status === "passed").length} checks passed`
        }
      />
      {shots.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          {shots.map((shot) => (
            <ScreenshotThumb
              key={`${shot.key}:${shot.url}`}
              viewport={shot.viewport}
              url={shot.url}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No screenshots available. Screenshots are kept for 30 days.
        </p>
      )}
    </div>
  );
}
