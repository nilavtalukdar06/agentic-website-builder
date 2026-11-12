"use client";

import { useState } from "react";
import { FolderIcon } from "lucide-react";
import { CreditsCard } from "@/components/credits/credits-card";
import { ProjectCard } from "@/components/projects/project-card";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { RecentProjectsMenu } from "@/components/shell/recent-projects-menu";
import { Button } from "@/components/ui/button";
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
import {
  WorkspaceHeader,
  type WorkspaceView,
} from "@/components/workspace/workspace-header";
import {
  sampleCredits,
  sampleGeneratingFiles,
  sampleProjects,
  sampleRecentProjects,
  sampleUser,
} from "../_data/fixtures";
import { DesignSection, Example } from "./section";

export function PatternsSection() {
  const [view, setView] = useState<WorkspaceView>("preview");

  return (
    <DesignSection
      id="patterns"
      description="Our compositions, built only from the tokens and components above."
    >
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
          <Example title="WorkspaceHeader" description="Building, then done.">
            <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
              <WorkspaceHeader
                projectName="Ember & Oak Roasters"
                building
                view={view}
                onViewChange={setView}
                user={sampleUser}
              />
              <WorkspaceHeader
                projectName="Ember & Oak Roasters"
                building={false}
                version={3}
                view={view}
                onViewChange={setView}
                user={sampleUser}
              />
              <WorkspaceHeader
                projectName="Lumen analytics"
                building={false}
                version={7}
                view={view}
                onViewChange={setView}
                githubRepo="nilav/lumen-analytics"
                user={sampleUser}
              />
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
        </div>
      </div>
    </DesignSection>
  );
}
