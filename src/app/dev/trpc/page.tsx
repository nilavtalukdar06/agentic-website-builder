import { Suspense } from "react";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { ProjectListSkeleton } from "./_components/project-card-skeleton";
import { ProjectList } from "./_components/project-list";

export default function DevTrpcPage() {
  void getQueryClient().prefetchQuery(trpc.dev.project.list.queryOptions());

  return (
    <>
      <h1 className="text-page-title">tRPC data layer</h1>
      <HydrateClient>
        <Suspense fallback={<ProjectListSkeleton />}>
          <ProjectList />
        </Suspense>
      </HydrateClient>
    </>
  );
}
