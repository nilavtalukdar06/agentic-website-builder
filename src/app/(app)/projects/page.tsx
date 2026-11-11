import type { Metadata } from "next";
import { loadProjectsSearchParams } from "@/lib/search-params/projects-loader";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { ProjectsView } from "./_components/projects-view";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, filter, sort } = await loadProjectsSearchParams(searchParams);
  await getQueryClient().prefetchQuery(
    trpc.project.list.queryOptions({ q, filter, sort }),
  );

  return (
    <HydrateClient>
      <ProjectsView />
    </HydrateClient>
  );
}
