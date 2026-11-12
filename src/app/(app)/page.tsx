import type { Metadata } from "next";
import { Aurora } from "@/components/brand";
import { HOME_RECENT_LIMIT } from "@/lib/project-limits";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { NewProjectPrompt } from "./_components/new-project-prompt";
import { RecentProjects } from "./_components/recent-projects";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export default async function Home() {
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      trpc.project.recent.queryOptions({ limit: HOME_RECENT_LIMIT }),
    ),
    queryClient.prefetchQuery(trpc.model.list.queryOptions()),
  ]);

  return (
    <HydrateClient>
      <div className="flex w-full flex-1 flex-col gap-10 px-4 pt-2 pb-12 md:px-6">
        <section className="relative overflow-hidden rounded-2xl border px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <Aurora />
          <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-display">What should we build today?</h1>
              <p className="text-muted-foreground">
                Describe a website. Vibe writes the Next.js code in a live
                sandbox while you watch.
              </p>
            </div>
            <NewProjectPrompt />
          </div>
        </section>
        <div className="mx-auto w-full max-w-6xl">
          <RecentProjects />
        </div>
      </div>
    </HydrateClient>
  );
}
