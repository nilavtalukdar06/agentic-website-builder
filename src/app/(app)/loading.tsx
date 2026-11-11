import { ProjectGridSkeleton } from "@/components/projects/project-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 pt-16 pb-12 md:pt-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8">
        <div className="flex w-full flex-col items-center gap-3">
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-5 w-120 max-w-full" />
        </div>
        <Skeleton className="h-34 w-full rounded-xl" />
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-32 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-28" />
        </div>
        <ProjectGridSkeleton count={6} />
      </div>
    </div>
  );
}
