import { parseAsString, parseAsStringLiteral } from "nuqs/server";

export const projectFilters = ["all", "github", "local"] as const;
export type ProjectFilter = (typeof projectFilters)[number];

export const projectSorts = ["edited", "name", "created"] as const;
export type ProjectSort = (typeof projectSorts)[number];

export const projectFilterLabels: Record<ProjectFilter, string> = {
  all: "All",
  github: "On GitHub",
  local: "Not exported",
};

export const projectSortLabels: Record<ProjectSort, string> = {
  edited: "Last edited",
  name: "Name",
  created: "Created",
};

export const projectsSearchParams = {
  q: parseAsString.withDefault(""),
  filter: parseAsStringLiteral(projectFilters).withDefault("all"),
  sort: parseAsStringLiteral(projectSorts).withDefault("edited"),
};
