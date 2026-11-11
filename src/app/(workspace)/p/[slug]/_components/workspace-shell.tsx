import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export function WorkspaceShell({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex h-13 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <Link href="/" aria-label="Home" className="rounded-md p-1">
          <LogoMark size={20} />
        </Link>
        <span className="text-muted-foreground" aria-hidden>
          /
        </span>
        <span className="min-w-0 truncate font-medium">{title}</span>
        <ThemeToggle className="ml-auto" />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
