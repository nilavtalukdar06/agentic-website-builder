import type { Metadata } from "next";
import { loadUsageSearchParams } from "@/lib/search-params/usage-loader";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { UsageView } from "./_components/usage-view";
export const metadata: Metadata = {
  title: "Usage & credits",
  robots: { index: false, follow: false },
};
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { range, page } = await loadUsageSearchParams(searchParams);
  await getQueryClient().fetchQuery(
    trpc.credits.usage.queryOptions({ range, page: Math.max(1, page) }),
  );
  return (
    <HydrateClient>
      <UsageView />
    </HydrateClient>
  );
}
