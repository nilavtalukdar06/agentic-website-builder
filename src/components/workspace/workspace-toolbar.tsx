"use client";

import {
  CodeIcon,
  ExternalLinkIcon,
  EyeIcon,
  MonitorIcon,
  PanelLeftOpenIcon,
  RotateCwIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react";
import { GithubIcon } from "@/components/icons/github-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { initials } from "@/lib/initials";
import type { PreviewDevice } from "@/lib/search-params/workspace";
import { cn } from "@/lib/utils";

export type WorkspaceView = "preview" | "code";

export const EXPORT_SOON = "Export to GitHub is coming in a later update";

const viewTabs = [
  { value: "preview", label: "Preview", icon: EyeIcon },
  { value: "code", label: "Code", icon: CodeIcon },
] as const;

const devices = [
  { value: "desktop", label: "Desktop", icon: MonitorIcon },
  { value: "tablet", label: "Tablet", icon: TabletIcon },
  { value: "mobile", label: "Mobile", icon: SmartphoneIcon },
] as const;

export type PreviewControls = {
  url: string | null;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  onReload: () => void;
  reloadDisabled?: boolean;
};

export type WorkspaceToolbarProps = {
  view: WorkspaceView;
  onViewChange?: (view: WorkspaceView) => void;
  preview?: PreviewControls;
  building: boolean;
  githubRepo?: string | null;
  onExport?: () => void;
  onExpandChat?: () => void;
  user: { name: string; image?: string | null };
  className?: string;
};

function displayAddress(url: string | null) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function PreviewBar({ preview }: { preview: PreviewControls }) {
  const current =
    devices.find((device) => device.value === preview.device) ?? devices[0];
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Device: ${current.label}`}
                  />
                }
              />
            }
          >
            <current.icon />
          </TooltipTrigger>
          <TooltipContent>Device size</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Device</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preview.device}
              onValueChange={(value) =>
                preview.onDeviceChange(value as PreviewDevice)
              }
            >
              {devices.map((device) => (
                <DropdownMenuRadioItem key={device.value} value={device.value}>
                  <device.icon />
                  {device.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <InputGroup className="h-8 max-w-md min-w-0 flex-1 rounded-full">
        <InputGroupAddon>
          <InputGroupButton
            size="icon-xs"
            className="rounded-full"
            aria-label="Reload"
            disabled={preview.reloadDisabled}
            onClick={preview.onReload}
          >
            <RotateCwIcon />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput
          readOnly
          aria-label="Preview URL"
          value={displayAddress(preview.url)}
          placeholder="No preview yet"
          className="text-center"
        />
      </InputGroup>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open in new tab"
              disabled={!preview.url}
              onClick={() =>
                preview.url && window.open(preview.url, "_blank", "noopener")
              }
            />
          }
        >
          <ExternalLinkIcon />
        </TooltipTrigger>
        <TooltipContent>Open in new tab</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function WorkspaceToolbar({
  view,
  onViewChange,
  preview,
  building,
  githubRepo,
  onExport,
  onExpandChat,
  user,
  className,
}: WorkspaceToolbarProps) {
  const exportButton = (
    <Button
      variant="accent"
      size="chip"
      disabled={building}
      aria-disabled={!onExport || undefined}
      onClick={onExport ?? (() => toast.add({ title: EXPORT_SOON }))}
    >
      <GithubIcon data-icon="inline-start" />
      Export to GitHub
    </Button>
  );

  return (
    <div
      data-slot="workspace-toolbar"
      className={cn("flex h-13 items-center gap-2 px-1 text-sm", className)}
    >
      <div className="flex items-center gap-1">
        {onExpandChat ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Show chat"
                  onClick={onExpandChat}
                />
              }
            >
              <PanelLeftOpenIcon />
            </TooltipTrigger>
            <TooltipContent>Show chat</TooltipContent>
          </Tooltip>
        ) : null}
        <Tabs
          value={view}
          onValueChange={(value) => onViewChange?.(value as WorkspaceView)}
        >
          <TabsList className="h-9 gap-0.5 rounded-full border bg-transparent">
            {viewTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                aria-label={tab.label}
                className="group/tab h-7 flex-none overflow-hidden rounded-full px-1.5 font-[450] transition-[background-color,color] duration-150 motion-reduce:transition-none data-active:bg-brand-soft data-active:text-brand-text"
              >
                <tab.icon />
                <span
                  aria-hidden
                  className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,margin,opacity] duration-[340ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-data-active/tab:mr-0.5 group-data-active/tab:ml-0.5 group-data-active/tab:max-w-45 group-data-active/tab:opacity-100 motion-reduce:transition-none"
                >
                  {tab.label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {preview && view === "preview" ? (
        <PreviewBar preview={preview} />
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {githubRepo ? (
          <a
            href={`https://github.com/${githubRepo}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "chip" }),
              "rounded-full",
            )}
          >
            <GithubIcon data-icon="inline-start" />
            On GitHub
          </a>
        ) : onExport ? (
          exportButton
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} />}>
              {exportButton}
            </TooltipTrigger>
            <TooltipContent>{EXPORT_SOON}</TooltipContent>
          </Tooltip>
        )}
        <Avatar className="size-8">
          {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
