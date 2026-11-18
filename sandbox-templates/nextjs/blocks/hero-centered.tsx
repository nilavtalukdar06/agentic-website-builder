import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HeroCenteredProps = {
  eyebrow?: string;
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  note?: string;
  className?: string;
};

export function HeroCentered({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  note,
  className,
}: HeroCenteredProps) {
  return (
    <section className={cn("relative overflow-hidden", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_65%)]"
      />
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 md:py-32">
        {eyebrow ? (
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {eyebrow}
          </Badge>
        ) : null}
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
          {title}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
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
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
    </section>
  );
}
