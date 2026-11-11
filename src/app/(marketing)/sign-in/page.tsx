import { ShieldIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { AppIcon, Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loadSignInSearchParams } from "@/lib/search-params/sign-in";
import { getSession } from "@/server/session";

export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/sign-in" },
};

const footerLinks = ["Docs", "Status", "Contact"] as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ callbackURL, error }, session] = await Promise.all([
    loadSignInSearchParams(searchParams),
    getSession(),
  ]);

  if (session) {
    redirect(callbackURL);
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Vibe home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <span className="hidden dark:inline-flex">
            <AppIcon variant="dark" size={48} />
          </span>
          <span className="inline-flex dark:hidden">
            <AppIcon variant="light" size={48} />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-page-title">Sign in to Vibe</h1>
            <p className="text-sm text-muted-foreground">
              Describe a website, watch it get built, export it to GitHub.
            </p>
          </div>
          {error ? (
            <Alert variant="destructive" className="text-left">
              <AlertDescription>
                Sign-in didn&apos;t complete ({error}). Try again.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex w-full flex-col gap-3">
            <SignInButton callbackURL={callbackURL} />
            <Alert className="text-left">
              <ShieldIcon />
              <AlertDescription>
                We only read your GitHub profile and email to sign you in.
                Repository access is requested later, when you first export a
                project.
              </AlertDescription>
            </Alert>
          </div>
          <p className="text-xs text-muted-foreground">
            By continuing, you agree to the{" "}
            <a
              href="#"
              className="text-foreground underline underline-offset-2"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="#"
              className="text-foreground underline underline-offset-2"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </main>
      <footer className="flex justify-center gap-6 py-6 text-xs text-muted-foreground">
        {footerLinks.map((label) => (
          <a key={label} href="#" className="hover:text-foreground">
            {label}
          </a>
        ))}
      </footer>
    </div>
  );
}
