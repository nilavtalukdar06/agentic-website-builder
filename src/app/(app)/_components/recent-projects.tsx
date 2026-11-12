"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRightIcon, FolderIcon, SearchIcon } from "lucide-react";
import {
  ProjectGrid,
  ProjectGridSkeleton,
} from "@/components/projects/project-grid";
import { ErrorState } from "@/components/states/error-state";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HOME_RECENT_LIMIT } from "@/lib/project-limits";
import { useTRPC } from "@/trpc/client";

function RecentProjectsBody() {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.project.recent.queryOptions({ limit: HOME_RECENT_LIMIT }),
  );

  if (query.isPending) {
    return <ProjectGridSkeleton count={HOME_RECENT_LIMIT} className="gap-6" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        className="border bg-card"
        title="Couldn't load your projects"
        onRetry={() => query.refetch()}
      />
    );
  }

  if (query.data.length === 0) {
    return (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>
            Describe a website above and Vibe will start building it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <ProjectGrid projects={query.data} className="gap-6" />;
}

const pill =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4";

export function RecentProjects() {
  return (
    <section aria-label="Recent projects" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Project views"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border p-1"
        >
          <Link
            href="/projects"
            className={`${pill} text-muted-foreground hover:bg-muted hover:text-foreground`}
          >
            <SearchIcon />
            Search
          </Link>
          <span
            aria-current="true"
            className={`${pill} bg-muted text-foreground`}
          >
            My projects
          </span>
          <span
            aria-disabled="true"
            title="Templates are coming soon"
            className={`${pill} cursor-not-allowed text-muted-foreground/70`}
          >
            Templates
            <span className="text-xs">Soon</span>
          </span>
        </div>
        <Link
          href="/projects"
          className={`${pill} shrink-0 font-medium text-foreground hover:bg-muted`}
        >
          Browse all
          <ArrowRightIcon />
        </Link>
      </div>
      <RecentProjectsBody />
    </section>
  );
}
