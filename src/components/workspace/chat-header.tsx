"use client";

import Link from "next/link";
import {
  ChevronDownIcon,
  CodeIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  LayoutGridIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ChatHeaderProps = {
  projectName: string;
  building: boolean;
  version?: number | null;
  projects?: { slug: string; name: string }[];
  versions?: { number: number; title: string; creditCost: number }[];
  onViewVersion?: (number: number) => void;
  onRestoreVersion?: (number: number) => void;
  restoreDisabled?: boolean;
  onCollapse?: () => void;
  collapseLabel?: string;
  collapseIcon?: LucideIcon;
  className?: string;
};

export type VersionHistoryItemsProps = {
  versions: { number: number; title: string; creditCost: number }[];
  version?: number | null;
  onViewVersion?: (number: number) => void;
  onRestoreVersion?: (number: number) => void;
  restoreDisabled?: boolean;
};

export function VersionHistoryItems({
  versions,
  version,
  onViewVersion,
  onRestoreVersion,
  restoreDisabled,
}: VersionHistoryItemsProps) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Versions</DropdownMenuLabel>
      {versions.map((item) => {
        const current = item.number === version;
        return (
          <DropdownMenuSub key={item.number}>
            <DropdownMenuSubTrigger>
              <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">
                v{item.number}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {current ? (
                <Badge variant="secondary" className="shrink-0">
                  Current
                </Badge>
              ) : null}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuGroup>
                {onViewVersion ? (
                  <DropdownMenuItem onClick={() => onViewVersion(item.number)}>
                    <CodeIcon />
                    View code
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  disabled={current || restoreDisabled}
                  onClick={() => onRestoreVersion?.(item.number)}
                >
                  <HistoryIcon />
                  Restore this version
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </DropdownMenuGroup>
  );
}

export function ChatHeader({
  projectName,
  building,
  version,
  projects,
  versions,
  onViewVersion,
  onRestoreVersion,
  restoreDisabled,
  onCollapse,
  collapseLabel = "Hide chat",
  collapseIcon: CollapseIcon = PanelLeftCloseIcon,
  className,
}: ChatHeaderProps) {
  return (
    <div
      data-slot="chat-header"
      className={cn("flex h-13 items-center gap-1 px-2 text-sm", className)}
    >
      <Link
        href="/"
        aria-label="Home"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent"
      >
        <LogoMark size={18} />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 font-medium"
              aria-label={`${projectName}. Switch project`}
            />
          }
        >
          <span className="truncate">{projectName}</span>
          <ChevronDownIcon
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/" />}>
              <HomeIcon />
              Home
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/projects" />}>
              <LayoutGridIcon />
              All projects
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {projects && projects.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.slug}
                    render={<Link href={`/p/${project.slug}`} />}
                  >
                    <FolderIcon />
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {building ? (
        <Badge variant="outline" className="shrink-0">
          <Spinner data-icon="inline-start" />
          Building
        </Badge>
      ) : version ? (
        <Badge variant="outline" className="shrink-0 font-mono">
          v{version}
        </Badge>
      ) : null}
      <div className="ml-auto flex items-center gap-0.5">
        {versions && versions.length > 0 ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label="Version history"
                      />
                    }
                  />
                }
              >
                <HistoryIcon />
              </TooltipTrigger>
              <TooltipContent>Version history</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-72">
              <VersionHistoryItems
                versions={versions}
                version={version}
                onViewVersion={onViewVersion}
                onRestoreVersion={onRestoreVersion}
                restoreDisabled={restoreDisabled}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onCollapse ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={collapseLabel}
                  onClick={onCollapse}
                />
              }
            >
              <CollapseIcon />
            </TooltipTrigger>
            <TooltipContent>{collapseLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
