"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function useSignOut() {
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

  return { signOut, pending };
}
