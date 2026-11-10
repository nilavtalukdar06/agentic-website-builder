"use client";

import { FileIcon } from "@/components/files/file-icon";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type GeneratingFile = {
  path: string;
  verb: string;
  status: "done" | "active" | "next";
};

export type GeneratingOverlayProps = {
  files: GeneratingFile[];
  elapsedSeconds: number;
  caption?: string;
  className?: string;
};

export function formatElapsed(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const fadeByDistance = [
  "opacity-100",
  "opacity-60",
  "opacity-40",
  "opacity-25",
];

export function GeneratingOverlay({
  files,
  elapsedSeconds,
  caption = "Preview loads after the first compile",
  className,
}: GeneratingOverlayProps) {
  const activeIndex = Math.max(
    0,
    files.findIndex((file) => file.status === "active"),
  );
  const active = files.find((file) => file.status === "active");
  const doneCount = files.filter((file) => file.status === "done").length;

  return (
    <div
      data-slot="generating-overlay"
      className={cn(
        "relative flex size-full items-center justify-center overflow-hidden bg-background",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-12 flex flex-col gap-6 opacity-40"
      >
        <div className="h-4 w-1/3 rounded-sm bg-muted" />
        <div className="h-40 rounded-lg border" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-24 rounded-lg border" />
          <div className="h-24 rounded-lg border" />
          <div className="h-24 rounded-lg border" />
        </div>
      </div>
      <div className="relative flex flex-col items-center gap-3">
        <p role="status" aria-live="polite" className="sr-only">
          {active ? `${active.verb} ${active.path}. ` : ""}
          {doneCount} {doneCount === 1 ? "file" : "files"} done.
        </p>
        <ul aria-hidden className="flex flex-col items-center gap-3">
          {files.map((file, index) => {
            const distance = Math.min(
              Math.abs(index - activeIndex),
              fadeByDistance.length - 1,
            );
            const isActive = file.status === "active";
            return (
              <li
                key={`${file.status}-${file.path}`}
                className={cn(
                  "flex items-center gap-2 text-muted-foreground",
                  fadeByDistance[distance],
                  isActive ? "text-lg text-foreground" : "text-sm",
                )}
              >
                <FileIcon
                  path={file.path}
                  className={cn(isActive && "size-5")}
                />
                {isActive ? (
                  <Shimmer as="span" className="font-medium">
                    {file.verb}
                  </Shimmer>
                ) : (
                  <span>{file.verb}</span>
                )}
                <span className="font-mono">{file.path}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-caption text-muted-foreground">
          <Spinner />
          {caption} ·{" "}
          <span className="font-mono tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
        </p>
      </div>
    </div>
  );
}
