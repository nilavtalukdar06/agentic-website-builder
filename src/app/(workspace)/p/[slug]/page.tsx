import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { cache } from "react";
import { loadWorkspaceSearchParams } from "@/lib/search-params/workspace-loader";
import { requireSession } from "@/server/session";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { Workspace } from "./_components/workspace";

type Params = Promise<{ slug: string }>;

const getProject = cache(async (slug: string) => {
  await requireSession();
  try {
    return await getQueryClient().fetchQuery(
      trpc.project.bySlug.queryOptions({ slug }),
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const project = await getProject((await params).slug);
  return { title: project.name, robots: { index: false, follow: false } };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const [session, project, { view }] = await Promise.all([
    requireSession(),
    getProject(slug),
    loadWorkspaceSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.fetchQuery(
      trpc.message.list.queryOptions({ projectId: project.id }),
    ),
    view === "code"
      ? queryClient.prefetchQuery(
          trpc.version.files.queryOptions({ projectId: project.id }),
        )
      : null,
  ]);

  return (
    <HydrateClient>
      <Workspace
        slug={slug}
        user={{ name: session.user.name, image: session.user.image }}
      />
    </HydrateClient>
  );
}
