import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const numberFormat = new Intl.NumberFormat("en-US");

export type CreditsCardProps = {
  balance: number;
  allowance: number;
  topUpHref?: string;
  className?: string;
};

export function CreditsCard({
  balance,
  allowance,
  topUpHref = "/usage",
  className,
}: CreditsCardProps) {
  const value =
    allowance > 0 ? Math.min(100, Math.max(0, (balance / allowance) * 100)) : 0;
  const empty = balance <= 0;

  return (
    <div
      data-slot="credits-card"
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Credits</span>
        <span className={cn("text-xs", empty && "text-destructive")}>
          <span className="font-mono">{numberFormat.format(balance)}</span>{" "}
          <span className="text-muted-foreground">left</span>
        </span>
      </div>
      <Progress value={value} aria-label="Credits remaining" />
      <Link
        href={topUpHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Top up
      </Link>
    </div>
  );
}
