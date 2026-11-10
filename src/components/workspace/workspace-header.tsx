"use client";

import Link from "next/link";
import { ChevronsUpDownIcon, CodeIcon, EyeIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { GithubIcon } from "@/components/icons/github-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

export type WorkspaceView = "preview" | "code";

export type WorkspaceHeaderProps = {
  projectName: string;
  building: boolean;
  version?: number | null;
  view: WorkspaceView;
  onViewChange?: (view: WorkspaceView) => void;
  githubRepo?: string | null;
  onExport?: () => void;
  user: { name: string; image?: string | null };
  className?: string;
};

export function WorkspaceHeader({
  projectName,
  building,
  version,
  view,
  onViewChange,
  githubRepo,
  onExport,
  user,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      data-slot="workspace-header"
      className={cn(
        "flex h-13 items-center gap-3 bg-background px-3 text-sm",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/" aria-label="Home" className="rounded-md p-1">
          <LogoMark size={20} />
        </Link>
        <span className="text-muted-foreground" aria-hidden>
          /
        </span>
        <Button variant="ghost" size="sm" className="min-w-0 font-medium">
          <span className="truncate">{projectName}</span>
          <ChevronsUpDownIcon
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        </Button>
        {building ? (
          <Badge variant="outline">
            <Spinner data-icon="inline-start" />
            Building
          </Badge>
        ) : version ? (
          <Badge variant="outline" className="font-mono">
            v{version}
          </Badge>
        ) : null}
      </div>
      <Tabs
        value={view}
        onValueChange={(value) => onViewChange?.(value as WorkspaceView)}
        className="ml-4"
      >
        <TabsList>
          <TabsTrigger value="preview" className="px-3">
            <EyeIcon data-icon="inline-start" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="code" className="px-3">
            <CodeIcon data-icon="inline-start" />
            Code
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {githubRepo ? (
          <a
            href={`https://github.com/${githubRepo}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            <GithubIcon data-icon="inline-start" />
            On GitHub
          </a>
        ) : (
          <Button variant="outline" disabled={building} onClick={onExport}>
            <GithubIcon data-icon="inline-start" />
            Export to GitHub
          </Button>
        )}
        <Avatar className="size-8">
          {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
