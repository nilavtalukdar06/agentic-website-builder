"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCwIcon } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { SIDEBAR_RECENT_LIMIT } from "@/lib/project-limits";
import { useTRPC } from "@/trpc/client";
import { RecentProjectsMenu } from "./recent-projects-menu";

export function SidebarRecentProjects() {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.project.recent.queryOptions({ limit: SIDEBAR_RECENT_LIMIT }),
  );

  if (query.isPending) {
    return (
      <SidebarMenu role="status" aria-label="Loading recent projects">
        {Array.from({ length: SIDEBAR_RECENT_LIMIT }, (_, index) => (
          <SidebarMenuItem key={index}>
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  if (query.isError) {
    return (
      <SidebarMenu role="alert">
        <SidebarMenuItem>
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Couldn&apos;t load projects
          </p>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={() => query.refetch()}>
            <RotateCwIcon />
            <span>Try again</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <RecentProjectsMenu
      projects={query.data.map((project) => ({
        name: project.name,
        href: `/p/${project.slug}`,
      }))}
    />
  );
}
