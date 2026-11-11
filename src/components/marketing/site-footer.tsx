import Link from "next/link";

export const footerLinks = [
  { label: "Docs", href: "/docs" },
  { label: "Status", href: "/status" },
  { label: "Contact", href: "/contact" },
] as const;

export function SiteFooter() {
  return (
    <footer className="flex justify-center py-6 text-xs text-muted-foreground">
      <nav aria-label="Footer" className="flex gap-6">
        {footerLinks.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
