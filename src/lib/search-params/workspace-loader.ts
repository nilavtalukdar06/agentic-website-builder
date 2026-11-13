import { createLoader } from "nuqs/server";
import { workspaceSearchParams } from "./workspace";

export const loadWorkspaceSearchParams = createLoader(workspaceSearchParams);
