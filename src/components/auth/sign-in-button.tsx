"use client";

import { useState } from "react";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function SignInButton({ callbackURL }: { callbackURL: string }) {
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL,
      errorCallbackURL: "/sign-in",
    });
    if (error) {
      setPending(false);
      toast.add({
        type: "error",
        title: "Couldn't reach GitHub",
        description: error.message ?? "Try again in a moment.",
      });
    }
  };

  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={signIn}>
      {pending ? (
        <Spinner data-icon="inline-start" aria-hidden />
      ) : (
        <GithubIcon data-icon="inline-start" />
      )}
      {pending ? "Redirecting to GitHub…" : "Continue with GitHub"}
    </Button>
  );
}
