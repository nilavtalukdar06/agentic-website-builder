"use client";

import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { Fragment, useMemo, useState } from "react";
import type { BundledLanguage } from "shiki";
import {
  DownloadIcon,
  FileArchiveIcon,
  FolderOpenIcon,
  HistoryIcon,
  XIcon,
} from "lucide-react";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
  FileTreeName,
} from "@/components/ai-elements/file-tree";
import { FileIcon } from "@/components/files/file-icon";
import { ErrorState } from "@/components/states/error-state";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FileChange } from "@/lib/agent/version-diff";
import {
  downloadFile,
  downloadZip,
  isBinarySnapshotValue,
} from "@/lib/download";
import {
  buildFileTree,
  languageFor,
  languageLabel,
  parentFolders,
  type TreeNode,
} from "@/lib/file-tree";
import { workspaceSearchParams } from "@/lib/search-params/workspace";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const MAX_TABS = 6;
const preferredFiles = ["app/page.tsx", "app/layout.tsx", "package.json"];

function TreeNodes({
  nodes,
  changes,
}: {
  nodes: TreeNode[];
  changes: Record<string, FileChange>;
}) {
  return nodes.map((node) =>
    node.type === "folder" ? (
      <FileTreeFolder key={node.path} path={node.path} name={node.name}>
        <TreeNodes nodes={node.children} changes={changes} />
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={node.path} path={node.path} name={node.name}>
        <span className="size-4 shrink-0" />
        <FileTreeIcon>
          <FileIcon path={node.path} />
        </FileTreeIcon>
        <FileTreeName className="flex-1">{node.name}</FileTreeName>
        {changes[node.path] ? (
          <span
            aria-label={changes[node.path] === "A" ? "Added" : "Modified"}
            className={cn(
              "font-mono text-xs",
              changes[node.path] === "A" ? "text-success" : "text-warning",
            )}
          >
            {changes[node.path]}
          </span>
        ) : null}
      </FileTreeFile>
    ),
  );
}

export function pickDefaultFile(paths: string[]) {
  return (
    preferredFiles.find((path) => paths.includes(path)) ?? paths[0] ?? null
  );
}

function CodeSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading files"
      className="grid size-full grid-cols-[16rem_1fr]"
    >
      <div className="flex flex-col gap-2 border-r p-3">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-5" />
        ))}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 16 }, (_, index) => (
          <Skeleton
            key={index}
            className={cn("h-4", index % 3 === 0 ? "w-1/2" : "w-4/5")}
          />
        ))}
      </div>
    </div>
  );
}

function FileBody({ path, value }: { path: string; value: string }) {
  if (isBinarySnapshotValue(value)) {
    if (value.startsWith("data:image/")) {
      return (
        <div className="flex size-full items-center justify-center p-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the version snapshot */}
          <img src={value} alt={path} className="max-h-full max-w-full" />
        </div>
      );
    }
    return (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyTitle>Binary file</EmptyTitle>
          <EmptyDescription>
            It can&apos;t be shown here. Download it to open it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <CodeBlock
      code={value}
      language={languageFor(path) as BundledLanguage}
      showLineNumbers
      className="rounded-none border-0"
    >
      <CodeBlockCopyButton
        className="absolute top-2 right-2 z-10"
        aria-label={`Copy ${path}`}
      />
    </CodeBlock>
  );
}

export function CodePanel({
  projectId,
  projectSlug,
  latestVersion,
}: {
  projectId: string;
  projectSlug: string;
  latestVersion: number | null;
}) {
  const trpc = useTRPC();
  const [{ file, version: versionParam }, setParams] = useQueryStates(
    workspaceSearchParams,
  );
  const pinned =
    versionParam !== null && versionParam !== latestVersion
      ? versionParam
      : null;
  const query = useQuery(
    trpc.version.files.queryOptions({
      projectId,
      ...(pinned === null ? {} : { number: pinned }),
    }),
  );
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [zipping, setZipping] = useState(false);

  const files = useMemo(() => query.data?.files ?? {}, [query.data]);
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const tree = useMemo(() => buildFileTree(paths), [paths]);
  const selected = file && file in files ? file : pickDefaultFile(paths);
  const tabs = useMemo(() => {
    const valid = openTabs.filter((path) => path in files);
    if (selected && !valid.includes(selected)) {
      return [...valid, selected].slice(-MAX_TABS);
    }
    return valid;
  }, [openTabs, files, selected]);
  const expanded = useMemo(
    () =>
      new Set([
        ...tree.flatMap((node) => (node.type === "folder" ? [node.path] : [])),
        ...(selected ? parentFolders(selected) : []),
      ]),
    [tree, selected],
  );

  if (query.isPending) return <CodeSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load the files"
        description={query.error.message}
        onRetry={() => void query.refetch()}
        className="size-full"
      />
    );
  }
  if (!query.data || paths.length === 0) {
    return (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpenIcon />
          </EmptyMedia>
          <EmptyTitle>No files yet</EmptyTitle>
          <EmptyDescription>
            They appear here once the agent saves the first version.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const version = query.data;
  const open = (path: string) => {
    setOpenTabs(tabs.includes(path) ? tabs : [...tabs, path].slice(-MAX_TABS));
    void setParams({ file: path });
  };
  const close = (path: string) => {
    const next = tabs.filter((tab) => tab !== path);
    setOpenTabs(next);
    if (path === selected) void setParams({ file: next.at(-1) ?? null });
  };
  const zip = async () => {
    setZipping(true);
    try {
      await downloadZip(`${projectSlug}-v${version.number}`, files);
    } catch {
      toast.add({ type: "error", title: "Couldn't build the ZIP" });
    } finally {
      setZipping(false);
    }
  };
  const content = selected ? files[selected] : null;
  const lineCount =
    content && !isBinarySnapshotValue(content)
      ? content.split("\n").length
      : null;

  return (
    <div className="flex size-full min-h-0 flex-col">
      {pinned !== null ? (
        <div
          role="status"
          className="flex h-10 shrink-0 items-center gap-2 border-b bg-brand-soft px-3 text-sm text-brand-text"
        >
          <HistoryIcon className="size-4" />
          <span className="min-w-0 truncate">
            Viewing version {version.number} · {version.title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void setParams({ version: null, file: null })}
          >
            Back to latest
          </Button>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr]">
        <div className="flex min-h-0 flex-col border-r">
          <div className="flex h-11 items-center gap-1 border-b px-3">
            <span className="text-sm font-medium">Files</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label="Download project as ZIP"
                    disabled={zipping}
                    onClick={zip}
                  />
                }
              >
                <FileArchiveIcon />
              </TooltipTrigger>
              <TooltipContent>Download project as ZIP</TooltipContent>
            </Tooltip>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <FileTree
              key={selected ?? "none"}
              defaultExpanded={expanded}
              selectedPath={selected ?? undefined}
              onSelect={(path) => {
                if (path in files) open(path);
              }}
              className="rounded-none border-0"
              aria-label="Project files"
            >
              <TreeNodes nodes={tree} changes={version.changes} />
            </FileTree>
          </ScrollArea>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-11 items-center border-b">
            <Tabs
              value={selected ?? ""}
              onValueChange={(value) => void setParams({ file: String(value) })}
              className="min-w-0 flex-1"
            >
              <TabsList variant="line" className="h-11 gap-0 overflow-x-auto">
                {tabs.map((path) => (
                  <div key={path} className="flex items-center">
                    <TabsTrigger value={path} className="gap-1.5 px-3">
                      <FileIcon path={path} />
                      {path.split("/").pop()}
                    </TabsTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Close ${path}`}
                      onClick={() => close(path)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
              </TabsList>
            </Tabs>
            {selected && content !== null ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="mx-2"
                      aria-label={`Download ${selected}`}
                      onClick={() => downloadFile(selected, content)}
                    />
                  }
                >
                  <DownloadIcon />
                </TooltipTrigger>
                <TooltipContent>Download file</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {selected && content !== null ? (
            <>
              <Breadcrumb className="px-4 py-2">
                <BreadcrumbList className="text-xs">
                  {selected.split("/").map((segment, index, segments) =>
                    index === segments.length - 1 ? (
                      <BreadcrumbItem key={index}>
                        <BreadcrumbPage>{segment}</BreadcrumbPage>
                      </BreadcrumbItem>
                    ) : (
                      <Fragment key={index}>
                        <BreadcrumbItem>{segment}</BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </Fragment>
                    ),
                  )}
                </BreadcrumbList>
              </Breadcrumb>
              <ScrollArea className="relative min-h-0 flex-1">
                <FileBody path={selected} value={content} />
              </ScrollArea>
            </>
          ) : (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyTitle>No file open</EmptyTitle>
                <EmptyDescription>Pick a file from the tree.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="flex h-8 items-center gap-4 border-t px-3 text-xs text-muted-foreground">
            {selected ? <span>{languageLabel(selected)}</span> : null}
            {lineCount !== null ? <span>{lineCount} lines</span> : null}
            <span className="ml-auto">
              Version {version.number} · {version.title}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
