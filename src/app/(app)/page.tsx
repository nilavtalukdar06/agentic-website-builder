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
      <div className="relative flex w-full flex-1 flex-col overflow-x-clip max-md:-mt-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="sticky top-0 h-svh">
            <Aurora />
          </div>
        </div>
        <section className="relative flex min-h-[85svh] flex-col items-center justify-center px-6 pt-14 pb-10">
          <div className="flex w-full max-w-3xl flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-display">What should we build today?</h1>
              <p className="text-foreground/80">
                Describe a website. Vibe writes the Next.js code in a live
                sandbox while you watch.
              </p>
            </div>
            <NewProjectPrompt />
          </div>
        </section>
        <div className="relative mx-3 mb-3 rounded-[2rem] border border-border/60 bg-background p-4 sm:p-6 md:mx-12 md:mb-12">
          <RecentProjects />
        </div>
      </div>
    </HydrateClient>
  );
}
