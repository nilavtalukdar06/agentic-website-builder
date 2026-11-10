"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDownIcon,
  CirclePlusIcon,
  CreditCardIcon,
  EllipsisIcon,
  FolderIcon,
  HouseIcon,
  LayoutGridIcon,
} from "lucide-react";
import { AppIcon } from "@/components/brand/app-icon";
import { CreditsCard } from "@/components/credits/credits-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { initials } from "@/lib/initials";

export const platformNav = [
  { title: "Home", href: "/", icon: HouseIcon },
  { title: "Projects", href: "/projects", icon: FolderIcon },
  { title: "Templates", href: "/templates", icon: LayoutGridIcon },
  { title: "Usage & credits", href: "/usage", icon: CreditCardIcon },
] as const;

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  workspaceName: string;
  recentProjects: { name: string; href: string }[];
  credits: { balance: number; allowance: number };
  user: { name: string; plan: string; image?: string | null };
  activeHref?: string;
};

export function AppSidebar({
  workspaceName,
  recentProjects,
  credits,
  user,
  activeHref,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const current = activeHref ?? pathname;

  return (
    <Sidebar {...props}>
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <AppIcon variant="light" size={32} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-medium">Vibe</span>
                <span className="truncate text-xs text-muted-foreground">
                  {workspaceName}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button variant="outline" className="w-full">
          <CirclePlusIcon data-icon="inline-start" />
          New project
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={current === item.href}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentProjects.length === 0 ? (
                <SidebarMenuItem>
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No projects yet
                  </p>
                </SidebarMenuItem>
              ) : (
                recentProjects.map((project) => (
                  <SidebarMenuItem key={project.href}>
                    <SidebarMenuButton
                      isActive={current === project.href}
                      render={<Link href={project.href} />}
                    >
                      <span>{project.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
              {recentProjects.length > 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-muted-foreground"
                    render={<Link href="/projects" />}
                  >
                    <EllipsisIcon />
                    <span>More</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <CreditsCard balance={credits.balance} allowance={credits.allowance} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="border bg-card">
              <Avatar className="size-8">
                {user.image ? (
                  <AvatarImage src={user.image} alt={user.name} />
                ) : null}
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.plan}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
