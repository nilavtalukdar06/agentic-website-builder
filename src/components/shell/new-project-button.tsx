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
      aria-label="New project"
      className="w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0!"
      onClick={startNewProject}
      {...props}
    >
      <CirclePlusIcon data-icon="inline-start" />
      <span className="group-data-[collapsible=icon]:hidden">New project</span>
    </Button>
  );
}
