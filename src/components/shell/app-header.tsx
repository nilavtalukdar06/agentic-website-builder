"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { platformNav } from "./app-sidebar";

export function breadcrumbsFor(pathname: string) {
  const home = { title: "Home", href: "/" };
  if (pathname === "/") return [home];
  const section = platformNav.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return section
    ? [home, { title: section.title, href: section.href }]
    : [home];
}

export function AppHeader() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);

  return (
    <header className="flex h-13 shrink-0 items-center gap-2 px-4">
      <SidebarTrigger />
      <Separator
        orientation="vertical"
        className="mr-1 h-4 data-vertical:self-center"
      />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <Fragment key={crumb.href}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {last ? (
                    <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.title}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <ThemeToggle className="ml-auto" />
    </header>
  );
}
