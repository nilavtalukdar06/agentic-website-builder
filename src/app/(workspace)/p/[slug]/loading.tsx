import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceShell } from "./_components/workspace-shell";

export default function Loading() {
  return (
    <WorkspaceShell title={<Skeleton className="h-4 w-40" />}>
      <div
        role="status"
        aria-label="Loading project"
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10"
      >
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3.5 w-1/4" />
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </CardContent>
        </Card>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </WorkspaceShell>
  );
}
