"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCardIcon,
  FolderIcon,
  HouseIcon,
  LayoutGridIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NewProjectButton } from "./new-project-button";
import { type ShellUser, UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

export const platformNav = [
  { title: "Home", href: "/", icon: HouseIcon },
  { title: "Projects", href: "/projects", icon: FolderIcon },
  { title: "Templates", href: "/templates", icon: LayoutGridIcon, soon: true },
  { title: "Usage & credits", href: "/usage", icon: CreditCardIcon },
] as const;

export function isNavActive(href: string, pathname: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  workspaceName: string;
  user: ShellUser;
  recent: React.ReactNode;
  credits: React.ReactNode;
  activeHref?: string;
};

export function AppSidebar({
  workspaceName,
  user,
  recent,
  credits,
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
            <WorkspaceSwitcher workspaceName={workspaceName} />
          </SidebarMenuItem>
        </SidebarMenu>
        <NewProjectButton />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {"soon" in item ? (
                    <>
                      <SidebarMenuButton aria-disabled>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>Soon</SidebarMenuBadge>
                    </>
                  ) : (
                    <SidebarMenuButton
                      isActive={isNavActive(item.href, current)}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>{recent}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        {credits}
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
