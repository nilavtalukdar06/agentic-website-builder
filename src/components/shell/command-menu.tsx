"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CirclePlusIcon, FolderIcon, RotateCwIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/client";
import { platformNav } from "./app-sidebar";
import { useStartNewProject } from "./new-project-button";

function CommandProjects({ onSelect }: { onSelect: (href: string) => void }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.project.list.queryOptions());

  if (query.isPending) {
    return (
      <CommandGroup heading="Projects">
        <div role="status" aria-label="Loading projects">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </CommandGroup>
    );
  }

  if (query.isError) {
    return (
      <CommandGroup heading="Projects">
        <CommandItem
          value="retry loading projects"
          onSelect={() => query.refetch()}
        >
          <RotateCwIcon />
          Couldn&apos;t load projects. Try again
        </CommandItem>
      </CommandGroup>
    );
  }

  if (query.data.projects.length === 0) {
    return (
      <CommandGroup heading="Projects">
        <CommandItem value="no projects yet" disabled>
          <FolderIcon />
          No projects yet
        </CommandItem>
      </CommandGroup>
    );
  }

  return (
    <CommandGroup heading="Projects">
      {query.data.projects.map((project) => (
        <CommandItem
          key={project.id}
          value={`${project.name} ${project.slug}`}
          onSelect={() => onSelect(`/p/${project.slug}`)}
        >
          <FolderIcon />
          <span className="truncate">{project.name}</span>
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
            {project.slug}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export function CommandMenu() {
  const router = useRouter();
  const startNewProject = useStartNewProject();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command menu"
      description="Start a project, jump to a page or open a project."
    >
      <Command>
        <CommandInput placeholder="Search projects and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem
              value="new project"
              onSelect={() => run(startNewProject)}
            >
              <CirclePlusIcon />
              New project
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Go to">
            {platformNav
              .filter((item) => !("soon" in item))
              .map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.title}
                  onSelect={() => run(() => router.push(item.href))}
                >
                  <item.icon />
                  {item.title}
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandSeparator />
          {open ? (
            <CommandProjects
              onSelect={(href) => run(() => router.push(href))}
            />
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
