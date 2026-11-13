"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { EyeIcon } from "lucide-react";
import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChatHeader } from "@/components/workspace/chat-header";
import { MobileBar } from "@/components/workspace/mobile-bar";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { workspaceSearchParams } from "@/lib/search-params/workspace";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { ChatPanel } from "./chat-panel";
import { CodePanel } from "./code-panel";
import { PreviewPanel } from "./preview-panel";
import { useProjectRealtime } from "./use-project-realtime";
import { usePreview } from "./use-preview";
import { useRestoreVersion } from "./use-restore-version";

export function Workspace({
  slug,
  user,
}: {
  slug: string;
  user: { name: string; image?: string | null };
}) {
  const trpc = useTRPC();
  const { data: project } = useSuspenseQuery({
    ...trpc.project.bySlug.queryOptions({ slug }),
    refetchInterval: (query) => (query.state.data?.building ? 5000 : false),
  });
  const recent = useQuery(trpc.project.recent.queryOptions({ limit: 8 }));
  const versions = useQuery(
    trpc.version.list.queryOptions({ projectId: project.id }),
  );
  const restore = useRestoreVersion();
  const [{ view: urlView, device }, setParams] = useQueryStates(
    workspaceSearchParams,
  );
  const [chatOpen, setChatOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<"chat" | "main">("chat");
  const isMobile = useIsMobile();
  const view = isMobile ? "preview" : urlView;
  const viewCode = (number: number) => {
    void setParams({ view: "code", version: number, file: null });
  };
  const { live, previewUrl } = useProjectRealtime(project.id, project.building);
  const preview = usePreview({
    projectId: project.id,
    building: project.building,
    hasVersion: project.version !== null,
    savedPreviewUrl: project.previewUrl,
    livePreviewUrl: previewUrl,
  });

  const restoreDisabled = project.building || restore.isPending;
  const restoreVersion = (number: number) =>
    restore.mutate({ projectId: project.id, number });
  const chatHeader = (
    <ChatHeader
      projectName={project.name}
      building={project.building}
      version={project.version}
      projects={recent.data?.filter((item) => item.slug !== project.slug)}
      versions={versions.data}
      onViewVersion={isMobile ? undefined : viewCode}
      onRestoreVersion={restoreVersion}
      restoreDisabled={restoreDisabled}
      onCollapse={() => (isMobile ? setMobilePane("main") : setChatOpen(false))}
      collapseLabel={isMobile ? "Show preview" : undefined}
      collapseIcon={isMobile ? EyeIcon : undefined}
    />
  );
  const chatPanel = (
    <ChatPanel
      projectId={project.id}
      projectName={project.name}
      building={project.building}
      live={live}
      onViewCode={isMobile ? undefined : viewCode}
    />
  );

  const panel = (
    <section
      aria-label={view === "code" ? "Code" : "Preview"}
      className={cn(
        "min-h-0 flex-1 overflow-hidden bg-background",
        !isMobile && "rounded-xl border",
      )}
    >
      {view === "code" ? (
        <CodePanel
          projectId={project.id}
          projectSlug={project.slug}
          latestVersion={project.version}
        />
      ) : (
        <PreviewPanel
          projectId={project.id}
          preview={preview}
          device={isMobile ? "desktop" : device}
          live={live}
        />
      )}
    </section>
  );

  const main = (
    <div
      className={cn(
        "flex size-full min-w-0 flex-col pr-2 pb-2",
        !chatOpen && "pl-2",
      )}
    >
      <WorkspaceToolbar
        view={view}
        onViewChange={(next) =>
          void setParams({
            view: next,
            ...(next === "preview" ? { version: null } : {}),
          })
        }
        preview={{
          url: preview.url,
          device,
          onDeviceChange: (next) => void setParams({ device: next }),
          onReload: preview.reload,
          reloadDisabled: !preview.url || project.building,
        }}
        building={project.building}
        githubRepo={project.githubRepo}
        onExpandChat={chatOpen ? undefined : () => setChatOpen(true)}
        user={user}
      />
      {panel}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-svh flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            mobilePane !== "chat" && "hidden",
          )}
        >
          {chatHeader}
          {chatPanel}
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            mobilePane !== "main" && "hidden",
          )}
        >
          {panel}
          <MobileBar
            onOpenChat={() => setMobilePane("chat")}
            previewUrl={preview.url}
            onReload={preview.reload}
            reloadDisabled={!preview.url || project.building}
            building={project.building}
            githubRepo={project.githubRepo}
            version={project.version}
            versions={versions.data}
            onRestoreVersion={restoreVersion}
            restoreDisabled={restoreDisabled}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      {chatOpen ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0">
          <ResizablePanel defaultSize="30%" minSize="22%" maxSize="50%">
            <div className="flex h-full min-h-0 flex-col">
              {chatHeader}
              {chatPanel}
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-2 bg-transparent" />
          <ResizablePanel minSize="40%">{main}</ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        main
      )}
    </div>
  );
}
