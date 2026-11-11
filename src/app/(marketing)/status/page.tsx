import type { Metadata } from "next";
import { loadStatusSearchParams } from "@/lib/search-params/status-loader";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { StatusView } from "./_components/status-view";

export const metadata: Metadata = {
  title: "Status",
  description: "Hourly uptime of the Vibe application.",
  alternates: { canonical: "/status" },
};

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { range } = await loadStatusSearchParams(searchParams);
  await getQueryClient().prefetchQuery(
    trpc.status.uptime.queryOptions({ range }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-6 pb-16">
      <HydrateClient>
        <StatusView />
      </HydrateClient>
    </main>
  );
}
