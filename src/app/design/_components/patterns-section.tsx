"use client";

import { useState } from "react";
import { FolderIcon } from "lucide-react";
import { CreditsCard } from "@/components/credits/credits-card";
import { ProjectCard } from "@/components/projects/project-card";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { RecentProjectsMenu } from "@/components/shell/recent-projects-menu";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SidebarProvider } from "@/components/ui/sidebar";
import { FileChip } from "@/components/workspace/file-chip";
import { GeneratingOverlay } from "@/components/workspace/generating-overlay";
import { ChatHeader } from "@/components/workspace/chat-header";
import {
  WorkspaceToolbar,
  type WorkspaceView,
} from "@/components/workspace/workspace-toolbar";
import type { PreviewDevice } from "@/lib/search-params/workspace";
import {
  sampleCredits,
  sampleGeneratingFiles,
  sampleRunSteps,
  sampleProjects,
  sampleRecentProjects,
  sampleUser,
} from "../_data/fixtures";
import { DesignSection, Example } from "./section";

export function PatternsSection() {
  const [view, setView] = useState<WorkspaceView>("preview");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [visibility, setVisibility] = useState(["private"]);
  const preview = {
    url: "https://3000-sbx8f2a1c.e2b.app/",
    device,
    onDeviceChange: setDevice,
    onReload: () => {},
  };

  return (
    <DesignSection
      id="patterns"
      description="Our compositions, built only from the tokens and components above."
    >
      <Example
        title="Export fields"
        description="Workspace export dialog, using the existing form and segmented control patterns."
      >
        <FieldGroup className="max-w-sm">
          <Field>
            <FieldLabel htmlFor="design-export-name">
              Repository name
            </FieldLabel>
            <Input id="design-export-name" defaultValue="ember-and-oak" />
          </Field>
          <Field>
            <FieldTitle id="design-export-visibility">Visibility</FieldTitle>
            <ToggleGroup
              aria-labelledby="design-export-visibility"
              variant="outline"
              value={visibility}
              onValueChange={(value) => {
                if (value.length) setVisibility(value);
              }}
            >
              <ToggleGroupItem value="private">Private</ToggleGroupItem>
              <ToggleGroupItem value="public">Public</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {visibility[0] === "private"
                ? "Only people with access to your repository can see its code."
                : "Anyone can see this repository and its code."}
            </FieldDescription>
          </Field>
          <Button variant="accent">Create repository and export</Button>
        </FieldGroup>
      </Example>
      <Example title="ProjectCard" description="Home and Projects grids.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sampleProjects.slice(0, 3).map((project) => (
            <ProjectCard
              key={project.slug}
              href="/design?section=patterns"
              {...project}
            />
          ))}
        </div>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>No projects match</EmptyTitle>
            <EmptyDescription>
              Try a different search or clear the filter.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">Clear filters</Button>
          </EmptyContent>
        </Empty>
      </Example>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Example title="AppSidebar">
          <SidebarProvider className="min-h-0 overflow-hidden rounded-lg border">
            <AppSidebar
              collapsible="none"
              className="h-180 w-full"
              recent={<RecentProjectsMenu projects={sampleRecentProjects} />}
              credits={<CreditsCard {...sampleCredits} />}
              user={sampleUser}
              activeHref="/"
            />
          </SidebarProvider>
        </Example>
        <div className="flex min-w-0 flex-col gap-4">
          <Example
            title="ChatHeader · WorkspaceToolbar"
            description="Workspace chrome on the sidebar colour: building, then done, then exported."
          >
            <div className="flex flex-col gap-2 rounded-lg border bg-sidebar p-2">
              <div className="grid gap-2 xl:grid-cols-[18rem_1fr]">
                <ChatHeader
                  projectName="Ember & Oak Roasters"
                  building
                  projects={sampleProjects.slice(0, 4)}
                  onCollapse={() => {}}
                />
                <WorkspaceToolbar
                  view={view}
                  onViewChange={setView}
                  preview={preview}
                  building
                  user={sampleUser}
                />
              </div>
              <div className="grid gap-2 xl:grid-cols-[18rem_1fr]">
                <ChatHeader
                  projectName="Ember & Oak Roasters"
                  building={false}
                  version={3}
                  projects={sampleProjects.slice(0, 4)}
                  onCollapse={() => {}}
                />
                <WorkspaceToolbar
                  view={view}
                  onViewChange={setView}
                  preview={preview}
                  building={false}
                  onExport={() => {}}
                  user={sampleUser}
                />
              </div>
              <div className="grid gap-2 xl:grid-cols-[18rem_1fr]">
                <ChatHeader
                  projectName="Lumen analytics"
                  building={false}
                  version={7}
                />
                <WorkspaceToolbar
                  view="code"
                  building={false}
                  githubRepo="nilav/lumen-analytics"
                  onExport={() => {}}
                  onExpandChat={() => {}}
                  user={sampleUser}
                />
              </div>
            </div>
          </Example>
          <div className="grid gap-4 md:grid-cols-2">
            <Example title="CreditsCard">
              <CreditsCard {...sampleCredits} />
              <CreditsCard balance={0} allowance={2000} />
            </Example>
            <Example title="FileChip" description="React, TS, CSS, JSON…">
              <div className="flex flex-wrap gap-2">
                <FileChip path="components/roast-grid.tsx" />
                <FileChip path="lib/utils.ts" />
                <FileChip path="app/globals.css" />
                <FileChip path="package.json" />
                <FileChip path="tsconfig.json" />
                <FileChip path="README.md" />
                <FileChip path="components/footer.tsx" addedLines={83} />
              </div>
            </Example>
          </div>
          <Example title="GeneratingOverlay">
            <GeneratingOverlay
              className="h-96 rounded-lg border"
              files={sampleGeneratingFiles}
              elapsedSeconds={43}
            />
          </Example>
          <Example
            title="GeneratingOverlay · run steps"
            description="Every step of a run, with its icon."
          >
            <GeneratingOverlay
              className="h-96 rounded-lg border"
              files={sampleRunSteps}
              elapsedSeconds={71}
              caption="The preview reloads when this version is saved"
            />
          </Example>
        </div>
      </div>
    </DesignSection>
  );
}
