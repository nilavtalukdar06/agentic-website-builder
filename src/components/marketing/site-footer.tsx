import { CONTACT_EMAIL } from "@/lib/contact";

export function SiteFooter() {
  return (
    <footer className="flex justify-center py-6 text-xs text-muted-foreground">
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {CONTACT_EMAIL}
      </a>
    </footer>
  );
}
