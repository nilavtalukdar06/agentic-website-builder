import { cn } from "@/lib/utils";

export type StatsProps = {
  items: { value: string; label: string }[];
  className?: string;
};

export function Stats({ items, className }: StatsProps) {
  return (
    <section className={cn("mx-auto max-w-6xl px-4 py-16 sm:px-6", className)}>
      <dl className="grid grid-cols-2 gap-8 rounded-2xl border bg-card p-8 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 text-center">
            <dt className="order-2 text-sm text-muted-foreground">
              {item.label}
            </dt>
            <dd className="order-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
