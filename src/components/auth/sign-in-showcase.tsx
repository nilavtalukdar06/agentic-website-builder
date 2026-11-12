"use client";

import { ArrowUpIcon } from "lucide-react";
import { Aurora } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useTypewriter } from "@/hooks/use-typewriter";
import { cn } from "@/lib/utils";

export const showcasePrompts = [
  "Ask Vibe to build your landing page.",
  "Ask Vibe for a portfolio with a project gallery.",
  "Ask Vibe for a restaurant menu with table booking.",
  "Ask Vibe for an admin dashboard with charts.",
] as const;

export function SignInShowcase({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { text, typing } = useTypewriter(showcasePrompts);

  return (
    <div
      data-slot="sign-in-showcase"
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl p-6",
        className,
      )}
      {...props}
    >
      <Aurora />
      <div
        role="status"
        aria-live="off"
        aria-label="Example prompt"
        className="light relative flex w-full max-w-md items-center gap-4 rounded-2xl bg-background/85 py-4 pr-4 pl-6 text-foreground backdrop-blur-md"
      >
        <p className="min-h-6 flex-1 text-base">
          <span data-slot="typewriter">{text}</span>
          <span
            aria-hidden
            className={cn(
              "ml-px inline-block h-5 w-px translate-y-1 bg-foreground align-baseline",
              typing ? "" : "motion-safe:animate-caret",
            )}
          />
        </p>
        <Button
          size="icon-lg"
          className="shrink-0 rounded-full"
          aria-label="Send example prompt"
          tabIndex={-1}
          aria-hidden
        >
          <ArrowUpIcon />
        </Button>
      </div>
    </div>
  );
}
