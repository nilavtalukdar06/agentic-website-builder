"use client";

import {
  EllipsisIcon,
  ExternalLinkIcon,
  HistoryIcon,
  MessageSquareIcon,
  MoonIcon,
  RotateCwIcon,
  SunIcon,
} from "lucide-react";
import { GithubIcon } from "@/components/icons/github-icon";
import { useTheme } from "@/components/theme/theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  VersionHistoryItems,
  type VersionHistoryItemsProps,
} from "./chat-header";
import { EXPORT_SOON } from "./workspace-toolbar";

export type MobileBarProps = {
  onOpenChat: () => void;
  previewUrl: string | null;
  onReload: () => void;
  reloadDisabled?: boolean;
  building: boolean;
  githubRepo?: string | null;
  version?: number | null;
  versions?: VersionHistoryItemsProps["versions"];
  onRestoreVersion?: (number: number) => void;
  restoreDisabled?: boolean;
  className?: string;
};

export function MobileBar({
  onOpenChat,
  previewUrl,
  onReload,
  reloadDisabled,
  building,
  githubRepo,
  version,
  versions,
  onRestoreVersion,
  restoreDisabled,
  className,
}: MobileBarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <div
      data-slot="mobile-bar"
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 px-3 pb-[env(safe-area-inset-bottom)] text-sm",
        className,
      )}
    >
      <Button
        variant="outline"
        size="sm"
        className="rounded-full px-3 has-data-[icon=inline-start]:pl-3"
        onClick={onOpenChat}
      >
        <MessageSquareIcon data-icon="inline-start" />
        Chat
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="More actions"
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={reloadDisabled} onClick={onReload}>
                <RotateCwIcon />
                Reload
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!previewUrl}
                onClick={() =>
                  previewUrl && window.open(previewUrl, "_blank", "noopener")
                }
              >
                <ExternalLinkIcon />
                Open in new tab
              </DropdownMenuItem>
              {versions && versions.length > 0 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <HistoryIcon />
                    Version history
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <VersionHistoryItems
                      versions={versions}
                      version={version}
                      onRestoreVersion={onRestoreVersion}
                      restoreDisabled={restoreDisabled}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme(dark ? "light" : "dark")}>
              {dark ? <SunIcon /> : <MoonIcon />}
              {dark ? "Light theme" : "Dark theme"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
        ) : (
          <Button
            variant="accent"
            size="chip"
            className="px-2.5 has-data-[icon=inline-start]:pl-2.5"
            disabled={building}
            aria-disabled
            onClick={() => toast.add({ title: EXPORT_SOON })}
          >
            <GithubIcon data-icon="inline-start" />
            Export
          </Button>
        )}
      </div>
    </div>
  );
}
