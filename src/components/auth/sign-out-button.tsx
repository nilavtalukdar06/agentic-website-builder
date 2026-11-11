"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    const { error } = await authClient.signOut();
    if (error) {
      setPending(false);
      toast.add({
        type: "error",
        title: "Couldn't sign out",
        description: error.message ?? "Try again in a moment.",
      });
      return;
    }
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <Button variant="outline" disabled={pending} onClick={signOut}>
      {pending ? (
        <Spinner data-icon="inline-start" aria-hidden />
      ) : (
        <LogOutIcon data-icon="inline-start" />
      )}
      Sign out
    </Button>
  );
}
