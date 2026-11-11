"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ProjectCard } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";

export function ProjectDetail({ slug }: { slug: string }) {
  const trpc = useTRPC();
  const { data, refetch, isFetching, dataUpdatedAt } = useSuspenseQuery(
    trpc.dev.project.bySlug.queryOptions({ slug }),
  );

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <ProjectCard
        href={`/dev/trpc/${data.slug}`}
        name={data.name}
        slug={data.slug}
        description={data.description}
        editedLabel={`Edited ${data.updatedAt.toISOString().slice(0, 10)}`}
        onGithub={Boolean(data.githubRepo)}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          {isFetching ? "Refetching…" : "Refetch"}
        </Button>
        <span
          className="text-xs text-muted-foreground"
          data-testid="updated-at"
          data-updated-at={dataUpdatedAt}
        >
          Last fetched {new Date(dataUpdatedAt).toISOString()}
        </span>
      </div>
    </div>
  );
}
