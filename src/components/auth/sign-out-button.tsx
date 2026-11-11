"use client";

import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSignOut } from "./use-sign-out";

export function SignOutButton() {
  const { signOut, pending } = useSignOut();

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
