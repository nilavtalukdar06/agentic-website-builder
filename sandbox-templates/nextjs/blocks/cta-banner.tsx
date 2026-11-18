import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CtaBannerProps = {
  title: string;
  description?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  className?: string;
};

export function CtaBanner({
  title,
  description,
  primary,
  secondary,
  className,
}: CtaBannerProps) {
  return (
    <section className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6", className)}>
      <div className="flex flex-col items-center gap-6 rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-xl text-lg text-pretty opacity-90">
            {description}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            variant="secondary"
            render={<Link href={primary.href} />}
            nativeButton={false}
          >
            {primary.label}
          </Button>
          {secondary ? (
            <Button
              size="lg"
              variant="ghost"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              render={<Link href={secondary.href} />}
              nativeButton={false}
            >
              {secondary.label}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
