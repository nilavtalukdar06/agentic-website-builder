import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HeroSplitProps = {
  eyebrow?: string;
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  highlights?: string[];
  visual?: ReactNode;
  className?: string;
};

export function HeroSplit({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  highlights = [],
  visual,
  className,
}: HeroSplitProps) {
  return (
    <section
      className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28", className)}
    >
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {eyebrow ? (
            <p className="text-sm font-medium text-primary">{eyebrow}</p>
          ) : null}
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            {description}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              render={<Link href={primary.href} />}
              nativeButton={false}
            >
              {primary.label}
            </Button>
            {secondary ? (
              <Button
                size="lg"
                variant="outline"
                render={<Link href={secondary.href} />}
                nativeButton={false}
              >
                {secondary.label}
              </Button>
            ) : null}
          </div>
          {highlights.length > 0 ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-primary"
                  />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-muted to-background">
          {visual}
        </div>
      </div>
    </section>
  );
}
