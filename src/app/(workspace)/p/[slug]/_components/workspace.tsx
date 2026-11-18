"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { EyeIcon, MousePointerClickIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChatHeader } from "@/components/workspace/chat-header";
import { DeleteProjectDialog } from "@/components/workspace/delete-project-dialog";
import { MobileBar } from "@/components/workspace/mobile-bar";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { workspaceSearchParams } from "@/lib/search-params/workspace";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { ExportDialog } from "./export-dialog";
import { useDeleteProject } from "./use-delete-project";
import { useGithubExport } from "./use-github-export";
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
    refetchInterval: (query) =>
      query.state.data?.building || query.state.data?.busy ? 5000 : false,
  });
  const recent = useQuery(trpc.project.recent.queryOptions({ limit: 8 }));
  const versions = useQuery(
    trpc.version.list.queryOptions({ projectId: project.id }),
  );
  const restore = useRestoreVersion();
  const githubExport = useGithubExport(project.id);
  const deleteProject = useDeleteProject();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [
    { view: urlView, device, export: exportOpen, exportError },
    setParams,
  ] = useQueryStates(workspaceSearchParams);
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
    version: project.version,
    savedPreviewUrl: project.previewUrl,
    livePreviewUrl: previewUrl,
    busy: !!project.busy,
  });

  const restoreDisabled =
    project.building ||
    restore.isPending ||
    !!project.busy ||
    githubExport.active;
  const exportDialog = (
    <ExportDialog
      open={exportOpen}
      onOpenChange={(open) =>
        void setParams({ export: open, exportError: false })
      }
      projectId={project.id}
      slug={slug}
      building={project.building}
      oauthError={exportError}
      state={githubExport}
    />
  );
  const deleteDialog = (
    <DeleteProjectDialog
      open={deleteOpen}
      onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) deleteProject.reset();
      }}
      projectName={project.name}
      pending={deleteProject.isPending || deleteProject.isSuccess}
      error={deleteProject.error?.message}
      blockedReason={
        project.building || project.busy || githubExport.active
          ? "Wait for the current build or operation to finish."
          : null
      }
      onConfirm={() =>
        deleteProject.mutate({ projectId: project.id, name: project.name })
      }
    />
  );
  const exportProps = {
    onExport: () => void setParams({ export: true, exportError: false }),
    exporting: githubExport.active || githubExport.pending,
    exportDisabled: !!project.busy,
  };
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
      onDelete={() => setDeleteOpen(true)}
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
      operationBusy={!!project.busy || githubExport.active}
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
        {...exportProps}
        onExpandChat={chatOpen ? undefined : () => setChatOpen(true)}
        user={user}
      />
      {panel}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-svh flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
        {exportDialog}
        {deleteDialog}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            mobilePane !== "chat" && "hidden",
          )}
        >
          {chatHeader}
          {project.building && live.browser?.open ? (
            <div className="px-2 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setMobilePane("main")}
              >
                <MousePointerClickIcon data-icon="inline-start" />
                Watch the browser check the site
              </Button>
            </div>
          ) : null}
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
            {...exportProps}
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
      {exportDialog}
      {deleteDialog}
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
