import Link from "next/link";
import { cn } from "@/lib/utils";

export type SiteFooterProps = {
  brand: string;
  tagline?: string;
  columns?: { title: string; links: { label: string; href: string }[] }[];
  legal?: string;
  className?: string;
};

export function SiteFooter({
  brand,
  tagline,
  columns = [],
  legal,
  className,
}: SiteFooterProps) {
  return (
    <footer className={cn("border-t bg-muted/30", className)}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold tracking-tight">{brand}</p>
          {tagline ? (
            <p className="max-w-xs text-sm text-muted-foreground">{tagline}</p>
          ) : null}
        </div>
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <p className="text-sm font-medium">{column.title}</p>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          {legal ??
            `© ${new Date().getFullYear()} ${brand}. All rights reserved.`}
        </p>
      </div>
    </footer>
  );
}
