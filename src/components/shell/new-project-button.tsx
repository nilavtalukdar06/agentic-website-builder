"use client";

import { usePathname, useRouter } from "next/navigation";
import { CirclePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PROMPT_INPUT_ID = "new-project-prompt";

export function useStartNewProject() {
  const router = useRouter();
  const pathname = usePathname();

  return () => {
    if (pathname === "/") {
      document.getElementById(PROMPT_INPUT_ID)?.focus();
      return;
    }
    router.push("/");
  };
}

export function NewProjectButton(
  props: Omit<React.ComponentProps<typeof Button>, "onClick" | "children">,
) {
  const startNewProject = useStartNewProject();

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={startNewProject}
      {...props}
    >
      <CirclePlusIcon data-icon="inline-start" />
      New project
    </Button>
  );
}
