"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import { AppIcon } from "@/components/brand/app-icon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function WorkspaceSwitcher({
  workspaceName,
}: {
  workspaceName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton size="lg" aria-label="Switch workspace" />}
      >
        <AppIcon variant="light" size={32} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium">Vibe</span>
          <span className="truncate text-xs text-muted-foreground">
            {workspaceName}
          </span>
        </span>
        <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>
            {workspaceName}
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
