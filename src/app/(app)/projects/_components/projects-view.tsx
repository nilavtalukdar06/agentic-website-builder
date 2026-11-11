"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FolderIcon, PlusIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";
import {
  ProjectGrid,
  ProjectGridSkeleton,
} from "@/components/projects/project-grid";
import { useStartNewProject } from "@/components/shell/new-project-button";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  type ProjectFilter,
  projectFilterLabels,
  projectFilters,
  type ProjectSort,
  projectSortLabels,
  projectSorts,
  projectsSearchParams,
} from "@/lib/search-params/projects";
import { useTRPC } from "@/trpc/client";

export const SEARCH_DEBOUNCE_MS = 300;

const sortItems = projectSorts.map((value) => ({
  value,
  label: projectSortLabels[value],
}));

export function projectCountLabel(total: number) {
  return `${total} ${total === 1 ? "project" : "projects"}, each running in its own sandbox.`;
}

export function ProjectsView() {
  const trpc = useTRPC();
  const startNewProject = useStartNewProject();
  const [{ q, filter, sort }, setParams] = useQueryStates(projectsSearchParams);
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  const query = useQuery({
    ...trpc.project.list.queryOptions({ q: debouncedQ, filter, sort }),
    placeholderData: keepPreviousData,
  });

  const filtered = q !== "" || filter !== "all";
  const clearFilters = () => setParams({ q: null, filter: null });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pt-10 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Projects</h1>
          {query.data ? (
            <p className="text-sm text-muted-foreground">
              {projectCountLabel(query.data.total)}
            </p>
          ) : (
            <Skeleton className="h-5 w-64" />
          )}
        </div>
        <Button onClick={startNewProject}>
          <PlusIcon data-icon="inline-start" />
          New project
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-full sm:w-90">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={q}
            onChange={(event) =>
              setParams(
                { q: event.target.value || null },
                {
                  limitUrlUpdates: event.target.value
                    ? debounce(SEARCH_DEBOUNCE_MS)
                    : undefined,
                },
              )
            }
          />
        </InputGroup>
        <Tabs
          value={filter}
          onValueChange={(value: ProjectFilter) =>
            setParams({ filter: value === "all" ? null : value })
          }
        >
          <TabsList aria-label="Filter projects">
            {projectFilters.map((value) => (
              <TabsTrigger key={value} value={value}>
                {projectFilterLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select
          items={sortItems}
          value={sort}
          onValueChange={(value: ProjectSort | null) =>
            setParams({ sort: !value || value === "edited" ? null : value })
          }
        >
          <SelectTrigger aria-label="Sort projects" className="sm:ml-auto">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <ProjectGridSkeleton count={6} />
      ) : query.isError ? (
        <ErrorState
          className="border"
          title="Couldn't load your projects"
          onRetry={() => query.refetch()}
        />
      ) : query.data.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Describe a website and Vibe builds it in its own sandbox.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={startNewProject}>
              <PlusIcon data-icon="inline-start" />
              New project
            </Button>
          </EmptyContent>
        </Empty>
      ) : query.data.projects.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No projects match</EmptyTitle>
            <EmptyDescription>
              Try a different search or clear the filter.
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ProjectGrid
          projects={query.data.projects}
          className={query.isPlaceholderData ? "opacity-60" : undefined}
        />
      )}
    </div>
  );
}
