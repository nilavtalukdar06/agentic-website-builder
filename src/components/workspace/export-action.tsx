"use client";

import { GithubIcon } from "@/components/icons/github-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExportActionProps = {
  githubRepo?: string | null;
  onExport?: () => void;
  disabled?: boolean;
  exporting?: boolean;
  compact?: boolean;
};

export function ExportAction({
  githubRepo,
  onExport,
  disabled,
  exporting,
  compact,
}: ExportActionProps) {
  return (
    <>
      {githubRepo ? (
        <a
          href={`https://github.com/${githubRepo}`}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({
              variant: "outline",
              size: compact ? "icon" : "chip",
            }),
            "rounded-full",
          )}
        >
          <GithubIcon data-icon="inline-start" />
          <span className={compact ? "sr-only" : undefined}>On GitHub</span>
        </a>
      ) : null}
      <Button
        variant="accent"
        size="chip"
        disabled={disabled || exporting || !onExport}
        onClick={onExport}
      >
        <GithubIcon data-icon="inline-start" />
        {exporting
          ? "Exporting…"
          : githubRepo
            ? "Re-export"
            : compact
              ? "Export"
              : "Export to GitHub"}
      </Button>
    </>
  );
}
