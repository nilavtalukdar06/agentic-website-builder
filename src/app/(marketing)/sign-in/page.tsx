import { ShieldIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { SignInShowcase } from "@/components/auth/sign-in-showcase";
import { AppIcon } from "@/components/brand";
import { A } from "@/components/marketing/prose";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loadSignInSearchParams } from "@/lib/search-params/sign-in";
import { getSession } from "@/server/session";

export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/sign-in" },
};

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
    <main className="grid flex-1 gap-8 px-6 pb-6 lg:grid-cols-2">
      <div className="flex items-center justify-center py-10 lg:justify-start lg:pl-[8vw]">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <span className="hidden dark:inline-flex">
            <AppIcon variant="dark" size={56} />
          </span>
          <span className="inline-flex dark:hidden">
            <AppIcon variant="light" size={56} />
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
            By continuing, you agree to the <A href="/terms">Terms</A> and{" "}
            <A href="/privacy">Privacy Policy</A>.
          </p>
        </div>
      </div>
      <SignInShowcase className="hidden min-h-[70svh] lg:flex" />
    </main>
  );
}
