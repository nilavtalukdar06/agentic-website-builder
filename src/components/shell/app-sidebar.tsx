"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCardIcon,
  FolderIcon,
  HouseIcon,
  LayoutGridIcon,
  PanelLeftIcon,
  SearchIcon,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useOpenCommandMenu } from "./command-menu";
import { NewProjectButton } from "./new-project-button";
import { type ShellUser, UserMenu } from "./user-menu";

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

function SidebarBrand() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="flex h-8 items-center justify-between gap-2 pl-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pl-0">
      <Link
        href="/"
        aria-label="Vibe home"
        className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:hidden"
      >
        <LogoMark size={24} />
      </Link>
      <button
        type="button"
        aria-label="Expand sidebar"
        onClick={toggleSidebar}
        className="group/brand hidden size-8 items-center justify-center rounded-md outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:flex"
      >
        <LogoMark size={22} className="group-hover/brand:hidden" />
        <PanelLeftIcon className="hidden size-4 group-hover/brand:block" />
      </button>
    </div>
  );
}

function SidebarSearch() {
  const openCommandMenu = useOpenCommandMenu();

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-label="Search"
          tooltip="Search"
          onClick={openCommandMenu}
        >
          <SearchIcon />
          <span>Search</span>
        </SidebarMenuButton>
        <SidebarMenuBadge aria-hidden>⌘K</SidebarMenuBadge>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: ShellUser;
  recent: React.ReactNode;
  credits: React.ReactNode;
  activeHref?: string;
};

export function AppSidebar({
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
      <SidebarHeader className="gap-3 group-data-[collapsible=icon]:items-center">
        <SidebarBrand />
        <NewProjectButton />
        <SidebarSearch />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="group-data-[collapsible=icon]:items-center">
              {platformNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {"soon" in item ? (
                    <>
                      <SidebarMenuButton
                        aria-disabled
                        tooltip={item.title}
                        className="border"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>Soon</SidebarMenuBadge>
                    </>
                  ) : (
                    <SidebarMenuButton
                      className={
                        isNavActive(item.href, current) ? "border" : ""
                      }
                      isActive={isNavActive(item.href, current)}
                      tooltip={item.title}
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
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>{recent}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 group-data-[collapsible=icon]:items-center">
        <div className="group-data-[collapsible=icon]:hidden">{credits}</div>
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
