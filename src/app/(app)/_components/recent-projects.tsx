"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRightIcon, FolderIcon } from "lucide-react";
import {
  ProjectGrid,
  ProjectGridSkeleton,
} from "@/components/projects/project-grid";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
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
    return <ProjectGridSkeleton count={HOME_RECENT_LIMIT} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        className="border"
        title="Couldn't load your projects"
        onRetry={() => query.refetch()}
      />
    );
  }

  if (query.data.length === 0) {
    return (
      <Empty className="border">
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

  return <ProjectGrid projects={query.data} />;
}

export function RecentProjects() {
  return (
    <section aria-labelledby="recent-projects" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-projects" className="text-card-title">
          Recent projects
        </h2>
        <Link
          href="/projects"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          See all projects
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </div>
      <RecentProjectsBody />
    </section>
  );
}
