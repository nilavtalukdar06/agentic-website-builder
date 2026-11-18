"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const CodeEditor = dynamic(() => import("./code-editor-impl"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-label="Loading the editor"
      className="flex flex-col gap-2 p-4"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", index % 3 === 0 ? "w-1/2" : "w-4/5")}
        />
      ))}
    </div>
  ),
});
