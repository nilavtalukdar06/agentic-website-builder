"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisIcon } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type RecentProjectLink = { name: string; href: string };

export function RecentProjectsMenu({
  projects,
}: {
  projects: RecentProjectLink[];
}) {
  const pathname = usePathname();

  if (projects.length === 0) {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        No projects yet
      </p>
    );
  }

  return (
    <SidebarMenu>
      {projects.map((project) => (
        <SidebarMenuItem key={project.href}>
          <SidebarMenuButton
            isActive={pathname === project.href}
            render={<Link href={project.href} />}
          >
            <span>{project.name}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
      <SidebarMenuItem>
        <SidebarMenuButton
          className="text-muted-foreground"
          render={<Link href="/projects" />}
        >
          <EllipsisIcon />
          <span>More</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
