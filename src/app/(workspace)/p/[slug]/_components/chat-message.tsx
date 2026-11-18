"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Image from "next/image";
import {
  BookmarkIcon,
  CircleAlertIcon,
  CodeIcon,
  HistoryIcon,
  CopyIcon,
  RotateCwIcon,
} from "lucide-react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrowserReport } from "@/components/workspace/browser-session";
import { MemoryNote } from "@/components/workspace/memory-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import type { AppRouter } from "@/server/trpc/routers/_app";
import {
  BuildTask,
  CommandTool,
  RestrictedNotice,
  SourceList,
} from "./agent-parts";
import { cn } from "@/lib/utils";

export type ConversationMessage =
  inferRouterOutputs<AppRouter>["message"]["list"]["messages"][number];

function UserMessage({
  message,
  status,
}: {
  message: ConversationMessage;
  status: "queued" | "stopping" | null;
}) {
  return (
    <Message from="user">
      <MessageContent>
        {message.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((attachment) =>
              attachment.url ? (
                <Image
                  key={attachment.id}
                  src={attachment.url}
                  alt={attachment.name}
                  width={64}
                  height={64}
                  unoptimized
                  className="size-16 rounded-md border object-cover"
                />
              ) : (
                <Badge key={attachment.id} variant="outline">
                  {attachment.name}
                </Badge>
              ),
            )}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </MessageContent>
      {status ? (
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {status === "stopping" ? <Spinner /> : null}
          {status === "stopping" ? "Stopping…" : "Queued"}
        </span>
      ) : null}
    </Message>
  );
}

type VersionInfo = NonNullable<ConversationMessage["version"]>;

export function VersionCard({
  version,
  isLatest,
  canRestore,
  onRestore,
  onViewCode,
}: {
  version: VersionInfo;
  isLatest: boolean;
  canRestore: boolean;
  onRestore: () => void;
  onViewCode?: () => void;
}) {
  const credits = `${version.creditCost} ${version.creditCost === 1 ? "credit" : "credits"}`;
  return (
    <div
      data-slot="version-card"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-3"
    >
      <div className="flex min-w-0 items-center gap-2 px-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{version.title}</span>
          <span className="text-xs text-muted-foreground">
            v{version.number} · {credits}
          </span>
        </div>
        <BookmarkIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div
        className={cn("grid gap-2", onViewCode ? "grid-cols-2" : "grid-cols-1")}
      >
        {onViewCode ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            aria-label={`View code of version ${version.number}`}
            onClick={onViewCode}
          >
            <CodeIcon data-icon="inline-start" />
            View code
          </Button>
        ) : null}
        {isLatest ? (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            disabled
          >
            Current version
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            aria-label={`Restore version ${version.number}`}
            disabled={!canRestore}
            onClick={onRestore}
          >
            <HistoryIcon data-icon="inline-start" />
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({
  projectId,
  message,
  canRetry,
  canRestore,
  isLatestVersion,
  onRetry,
  onRestore,
  onViewCode,
}: {
  projectId: string;
  message: ConversationMessage;
  canRetry: boolean;
  canRestore: boolean;
  isLatestVersion: boolean;
  onRetry: () => void;
  onRestore: (number: number) => void;
  onViewCode?: (number: number) => void;
}) {
  const parts = message.parts;
  const version = message.version;
  const reasoning = parts.find((part) => part.type === "reasoning");
  const task = parts.find((part) => part.type === "task");
  const tools = parts.flatMap((part) => (part.type === "tool" ? [part] : []));
  const sources = parts.flatMap((part) =>
    part.type === "sources" ? part.sources : [],
  );
  const error = parts.find((part) => part.type === "error");
  const browser = parts.find((part) => part.type === "browser");
  const memory = parts.find((part) => part.type === "memory");
  const restricted = parts.some(
    (part) => part.type === "guard" && part.verdict === "review",
  );
  const text =
    parts.find((part) => part.type === "text")?.text ??
    (error ? null : message.content);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(error?.message ?? text ?? "");
      toast.add({ title: "Copied the reply" });
    } catch {
      toast.add({ type: "error", title: "Couldn't copy the reply" });
    }
  };

  return (
    <>
      <Message from="assistant">
        <MessageContent>
          {reasoning ? (
            <Reasoning
              duration={Math.max(1, Math.round(reasoning.durationMs / 1000))}
              defaultOpen={false}
            >
              <ReasoningTrigger />
              <ReasoningContent>{reasoning.text}</ReasoningContent>
            </Reasoning>
          ) : null}
          {task ? (
            <BuildTask title={task.title} items={task.items} done />
          ) : null}
          {tools.map((tool) => (
            <CommandTool
              key={tool.callId}
              name={tool.name}
              command={tool.command}
              output={tool.output}
              exitCode={tool.exitCode}
            />
          ))}
          <SourceList sources={sources} />
          {browser ? <BrowserReport part={browser} /> : null}
          {memory ? <MemoryNote part={memory} projectId={projectId} /> : null}
          {restricted ? <RestrictedNotice /> : null}
          {error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
          {text ? <MessageResponse>{text}</MessageResponse> : null}
        </MessageContent>
        <MessageActions>
          <MessageAction tooltip="Copy" label="Copy reply" onClick={copy}>
            <CopyIcon />
          </MessageAction>
          {canRetry ? (
            <MessageAction tooltip="Retry" label="Retry" onClick={onRetry}>
              <RotateCwIcon />
            </MessageAction>
          ) : null}
        </MessageActions>
      </Message>
      {version ? (
        <VersionCard
          version={version}
          isLatest={isLatestVersion}
          canRestore={canRestore}
          onRestore={() => onRestore(version.number)}
          onViewCode={onViewCode ? () => onViewCode(version.number) : undefined}
        />
      ) : null}
    </>
  );
}

export function ChatMessage({
  projectId,
  message,
  status = null,
  canRetry = false,
  canRestore = false,
  isLatestVersion = false,
  onRetry,
  onRestore,
  onViewCode,
}: {
  projectId: string;
  message: ConversationMessage;
  status?: "queued" | "stopping" | null;
  canRetry?: boolean;
  canRestore?: boolean;
  isLatestVersion?: boolean;
  onRetry: () => void;
  onRestore: (number: number) => void;
  onViewCode?: (number: number) => void;
}) {
  if (message.role === "USER") {
    return <UserMessage message={message} status={status} />;
  }
  return (
    <AssistantMessage
      projectId={projectId}
      message={message}
      canRetry={canRetry}
      canRestore={canRestore}
      isLatestVersion={isLatestVersion}
      onRetry={onRetry}
      onRestore={onRestore}
      onViewCode={onViewCode}
    />
  );
}
