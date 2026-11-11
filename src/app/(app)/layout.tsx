import { cookies } from "next/headers";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandMenu } from "@/components/shell/command-menu";
import { SidebarCredits } from "@/components/shell/sidebar-credits";
import { SidebarRecentProjects } from "@/components/shell/sidebar-recent-projects";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
      <SidebarProvider
        defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      >
        <AppSidebar
          workspaceName="Personal workspace"
          user={{
            name: user.name,
            email: user.email,
            image: user.image,
            plan: "Pay as you go",
          }}
          recent={<SidebarRecentProjects />}
          credits={<SidebarCredits />}
        />
        <SidebarInset>
          <AppHeader />
          {children}
        </SidebarInset>
        <CommandMenu />
      </SidebarProvider>
    </HydrateClient>
  );
}
