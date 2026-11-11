import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { ProjectDetail } from "../_components/project-detail";

export default async function DevTrpcProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    await getQueryClient().fetchQuery(
      trpc.dev.project.bySlug.queryOptions({ slug }),
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <h1 className="text-page-title">{slug}</h1>
      <HydrateClient>
        <ProjectDetail slug={slug} />
      </HydrateClient>
    </>
  );
}
