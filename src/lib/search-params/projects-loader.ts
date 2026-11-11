import { createLoader } from "nuqs/server";
import { projectsSearchParams } from "./projects";

export const loadProjectsSearchParams = createLoader(projectsSearchParams);
