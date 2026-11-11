import { formatEdited } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./project-card";
import { ProjectCardSkeleton } from "./project-card-skeleton";

export type ProjectGridItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  githubRepo: string | null;
  updatedAt: Date;
};

const gridClassName = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

export function ProjectGrid({
  projects,
  now,
  className,
  label = "Projects",
}: {
  projects: ProjectGridItem[];
  now?: Date;
  className?: string;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cn(gridClassName, className)}>
      {projects.map((project) => (
        <li key={project.id} className="flex">
          <ProjectCard
            className="flex-1"
            href={`/p/${project.slug}`}
            name={project.name}
            slug={project.slug}
            description={project.description}
            editedLabel={formatEdited(project.updatedAt, now)}
            onGithub={Boolean(project.githubRepo)}
          />
        </li>
      ))}
    </ul>
  );
}

export function ProjectGridSkeleton({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading projects"
      className={cn(gridClassName, className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  );
}
