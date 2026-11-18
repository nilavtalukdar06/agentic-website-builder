import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatCard = {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
  icon?: LucideIcon;
};

export type StatCardsProps = { items: StatCard[]; className?: string };

export function StatCards({ items, className }: StatCardsProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {item.label}
              {item.icon ? <item.icon className="size-4" aria-hidden /> : null}
            </div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {item.value}
            </p>
            {item.change ? (
              <p
                className={cn(
                  "text-xs font-medium",
                  item.trend === "down" ? "text-destructive" : "text-primary",
                )}
              >
                {item.change}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
