import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

export type Feature = { icon: LucideIcon; title: string; description: string };

export type FeatureGridProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  features: Feature[];
  columns?: 2 | 3 | 4;
  className?: string;
};

const columnClass = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

export function FeatureGrid({
  id,
  eyebrow,
  title,
  description,
  features,
  columns = 3,
  className,
}: FeatureGridProps) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6", className)}
    >
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <ul className={cn("mt-12 grid gap-6", columnClass[columns])}>
        {features.map((feature) => (
          <li
            key={feature.title}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/40"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <feature.icon className="size-5" aria-hidden />
            </span>
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">
              {feature.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
