import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading project"
      className="flex h-svh overflow-hidden bg-sidebar"
    >
      <div className="flex w-[30%] min-w-64 flex-col max-md:w-full">
        <div className="flex h-13 items-center gap-2 px-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="ml-auto size-8 rounded-lg" />
        </div>
        <div className="flex flex-1 flex-col gap-6 px-3 pt-2">
          <Skeleton className="ml-auto h-20 w-4/5 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        </div>
        <div className="p-2">
          <Skeleton className="h-28 w-full rounded-[1.25rem]" />
        </div>
      </div>
      <div className="flex flex-1 flex-col pr-2 pb-2 pl-2 max-md:hidden">
        <div className="flex h-13 items-center gap-2 px-1">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="mx-auto h-8 w-80 rounded-full" />
          <Skeleton className="h-8 w-36 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="flex flex-1 flex-col gap-6 rounded-xl border bg-background p-12">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    </div>
  );
}
