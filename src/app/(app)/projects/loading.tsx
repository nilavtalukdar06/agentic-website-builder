import { ProjectGridSkeleton } from "@/components/projects/project-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pt-10 pb-12">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-full sm:w-90" />
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-8 w-40 sm:ml-auto" />
      </div>
      <ProjectGridSkeleton count={9} />
    </div>
  );
}
