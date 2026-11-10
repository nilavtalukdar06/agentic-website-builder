import { cn } from "@/lib/utils";
import {
  designSectionTitles,
  type DesignSection as DesignSectionId,
} from "@/lib/search-params/design";

export function DesignSection({
  id,
  description,
  children,
  className,
}: {
  id: DesignSectionId;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("flex scroll-mt-20 flex-col gap-6", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-page-title">
          {designSectionTitles[id]}
        </h2>
        {description ? (
          <p className="max-w-2xl text-body text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function Example({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-card-title">{title}</h3>
        {description ? (
          <p className="text-caption text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
