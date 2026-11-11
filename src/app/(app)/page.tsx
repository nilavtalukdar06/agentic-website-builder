import type { Metadata } from "next";
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
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 pt-16 pb-12 md:pt-24">
        <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-display">What should we build today?</h1>
            <p className="text-muted-foreground">
              Describe a website. Vibe writes the Next.js code in a live sandbox
              while you watch.
            </p>
          </div>
          <NewProjectPrompt />
        </section>
        <RecentProjects />
      </div>
    </HydrateClient>
  );
}
