"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ProjectCard } from "@/components/projects/project-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTRPC } from "@/trpc/client";

export function ProjectList() {
  const trpc = useTRPC();
  const { data: projects } = useSuspenseQuery(
    trpc.dev.project.list.queryOptions(),
  );

  if (projects.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>
            Run <code>bun run db:seed</code> to create the demo project.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id} className="flex">
          <ProjectCard
            className="flex-1"
            href={`/dev/trpc/${project.slug}`}
            name={project.name}
            slug={project.slug}
            description={project.description}
            editedLabel={`Edited ${project.updatedAt.toISOString().slice(0, 10)}`}
            onGithub={Boolean(project.githubRepo)}
          />
        </li>
      ))}
    </ul>
  );
}
