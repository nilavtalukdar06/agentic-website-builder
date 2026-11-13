"use client";

import { CheckCircle2Icon, ListIcon, ShieldAlertIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { FileIcon } from "@/components/files/file-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LiveFile } from "@/lib/agent/live-run";
import type { Source as SourceItem, TaskItem as Item } from "@/lib/agent/parts";

const verbs = {
  created: "Created",
  edited: "Edited",
  deleted: "Deleted",
} as const;
const activeVerbs = {
  created: "Creating",
  edited: "Editing",
  deleted: "Deleting",
} as const;
const MAX_READ_CHIPS = 3;
const MAX_TITLE_CHARS = 40;

export function shortCommand(command: string) {
  const line = command.trim().split("\n")[0];
  return line.length > MAX_TITLE_CHARS
    ? `${line.slice(0, MAX_TITLE_CHARS - 1)}…`
    : line;
}

function FileTag({ path }: { path: string }) {
  return (
    <TaskItemFile className="font-mono">
      <FileIcon path={path} />
      {path}
    </TaskItemFile>
  );
}

function TaskRow({ item }: { item: Item }) {
  if (item.kind === "sandbox") {
    return <TaskItem>{item.label}</TaskItem>;
  }
  if (item.kind === "install") {
    return (
      <TaskItem className="flex flex-wrap items-center gap-1">
        Installed
        {item.packages.map((name) => (
          <TaskItemFile key={name} className="font-mono">
            {name}
          </TaskItemFile>
        ))}
      </TaskItem>
    );
  }
  if (item.kind === "read") {
    const extra = item.paths.length - MAX_READ_CHIPS;
    return (
      <TaskItem className="flex flex-wrap items-center gap-1">
        Read
        {item.paths.slice(0, MAX_READ_CHIPS).map((path) => (
          <FileTag key={path} path={path} />
        ))}
        {extra > 0 ? (
          <span className="text-xs text-muted-foreground">+{extra} more</span>
        ) : null}
      </TaskItem>
    );
  }
  if (item.kind === "skill") {
    return (
      <TaskItem className="flex flex-wrap items-center gap-1">
        Loaded skill
        <TaskItemFile className="font-mono">{item.name}</TaskItemFile>
      </TaskItem>
    );
  }
  return (
    <TaskItem className="flex flex-wrap items-center gap-1">
      {verbs[item.verb]}
      <FileTag path={item.path} />
      {item.verb !== "deleted" && item.lines > 0 ? (
        <span className="font-mono text-xs text-success">+{item.lines}</span>
      ) : null}
    </TaskItem>
  );
}

export function fileCount(items: readonly Item[]) {
  return new Set(
    items.flatMap((item) =>
      item.kind === "file" && item.verb !== "deleted" ? [item.path] : [],
    ),
  ).size;
}

export function BuildTask({
  title,
  items,
  active,
  done,
}: {
  title: string;
  items: readonly Item[];
  active?: LiveFile | null;
  done?: boolean;
}) {
  if (items.length === 0 && !active) return null;
  const files = fileCount(items);
  const label = done
    ? `${title} · ${files} ${files === 1 ? "file" : "files"}`
    : title;
  return (
    <Task defaultOpen={!done}>
      <TaskTrigger title={label}>
        <div className="flex w-full cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {done ? (
            <CheckCircle2Icon className="size-4" />
          ) : (
            <ListIcon className="size-4" />
          )}
          <span>{label}</span>
        </div>
      </TaskTrigger>
      <TaskContent>
        {items.map((item, index) => (
          <TaskRow key={index} item={item} />
        ))}
        {active ? (
          <TaskItem className="flex items-center gap-1">
            <Shimmer as="span">{activeVerbs[active.verb]}</Shimmer>
            <TaskItemFile className="font-mono">
              <FileIcon path={active.path} />
              {active.path}
            </TaskItemFile>
          </TaskItem>
        ) : null}
      </TaskContent>
    </Task>
  );
}

export function CommandTool({
  name,
  command,
  output,
  exitCode,
  running,
}: {
  name: string;
  command: string | null;
  output: string;
  exitCode: number | null;
  running?: boolean;
}) {
  const state = running
    ? "input-available"
    : exitCode !== null && exitCode !== 0
      ? "output-error"
      : "output-available";
  const transcript = [command ? `$ ${command}` : null, output]
    .filter(Boolean)
    .join("\n");
  return (
    <Tool defaultOpen={false}>
      <ToolHeader
        type="dynamic-tool"
        toolName={name}
        title={command ? shortCommand(command) : name}
        state={state}
      />
      <ToolContent>
        <Terminal
          output={transcript}
          isStreaming={running}
          className="m-3 mt-0 max-h-64"
        />
      </ToolContent>
    </Tool>
  );
}

export function SourceList({ sources }: { sources: readonly SourceItem[] }) {
  if (sources.length === 0) return null;
  return (
    <Sources>
      <SourcesTrigger count={sources.length} />
      <SourcesContent>
        {sources.map((source) => (
          <Source key={source.url} href={source.url} title={source.title} />
        ))}
      </SourcesContent>
    </Sources>
  );
}

export function RestrictedNotice() {
  return (
    <Alert>
      <ShieldAlertIcon />
      <AlertTitle>Restricted run</AlertTitle>
      <AlertDescription>
        The safety check flagged this request for review, so web search and
        unvetted packages were turned off while it ran.
      </AlertDescription>
    </Alert>
  );
}
