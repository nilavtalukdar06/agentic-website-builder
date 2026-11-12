import { ProjectGridSkeleton } from "@/components/projects/project-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="relative flex w-full flex-1 flex-col overflow-x-clip max-md:-mt-12">
      <section className="relative flex min-h-[85svh] flex-col items-center justify-center px-6 pt-14 pb-10">
        <div className="flex w-full max-w-3xl flex-col items-center gap-8">
          <div className="flex w-full flex-col items-center gap-3">
            <Skeleton className="h-10 w-96 max-w-full" />
            <Skeleton className="h-5 w-120 max-w-full" />
          </div>
          <Skeleton className="h-30 w-full rounded-[1.75rem]" />
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-32 rounded-full" />
            ))}
          </div>
        </div>
      </section>
      <div className="relative mx-3 mb-3 flex flex-col gap-6 rounded-[2rem] border border-border/60 bg-background p-4 sm:p-6 md:mx-12 md:mb-12">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-72 max-w-full rounded-full" />
          <Skeleton className="h-5 w-24" />
        </div>
        <ProjectGridSkeleton count={6} className="gap-6" />
      </div>
    </div>
  );
}
