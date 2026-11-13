import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import {
  CommandMenu,
  CommandMenuProvider,
} from "@/components/shell/command-menu";
import { SidebarCredits } from "@/components/shell/sidebar-credits";
import { SidebarRecentProjects } from "@/components/shell/sidebar-recent-projects";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SIDEBAR_RECENT_LIMIT } from "@/lib/project-limits";
import { requireSession } from "@/server/session";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ user }, cookieStore] = await Promise.all([
    requireSession(),
    cookies(),
  ]);
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      trpc.project.recent.queryOptions({ limit: SIDEBAR_RECENT_LIMIT }),
    ),
    queryClient.prefetchQuery(trpc.credits.balance.queryOptions()),
  ]);

  return (
    <HydrateClient>
      <CommandMenuProvider>
        <SidebarProvider
          className="h-svh"
          defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
        >
          <AppSidebar
            variant="inset"
            collapsible="icon"
            user={{
              name: user.name,
              email: user.email,
              image: user.image,
              plan: "Pay as you go",
            }}
            recent={<SidebarRecentProjects />}
            credits={<SidebarCredits />}
          />
          <SidebarInset className="min-h-0 overflow-y-auto border max-md:pt-12">
            <SidebarTrigger
              aria-label="Open sidebar"
              className="absolute top-3 left-3 z-10 border bg-background/80 backdrop-blur-md md:hidden"
            />
            {children}
          </SidebarInset>
          <CommandMenu />
        </SidebarProvider>
      </CommandMenuProvider>
    </HydrateClient>
  );
}
