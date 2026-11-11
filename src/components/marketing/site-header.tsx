import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-5">
      <Link
        href="/"
        aria-label="Vibe home"
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Logo />
      </Link>
      <ThemeToggle />
    </header>
  );
}
