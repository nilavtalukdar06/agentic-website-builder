import "server-only";
import { gateway } from "@/server/ai/gateway";
import { extractSummary } from "../conversation";
import { builderInstructions } from "../prompts/system";
import { SEARCH_TOOL } from "../search";
import { SKILL_NAMES } from "../skills";
import { builderTools } from "../tools";
import type { AgentSpec } from "./types";

export function builderSpec({ search }: { search: boolean }): AgentSpec {
  return {
    name: "builder",
    tools: search
      ? {
          ...builderTools,
          [SEARCH_TOOL]: gateway.tools.parallelSearch({
            mode: "basic",
            maxResults: 5,
            maxCharsTotal: 6000,
          }),
        }
      : builderTools,
    skills: SKILL_NAMES,
    instructions: (skills) => builderInstructions(skills, search),
    output: extractSummary,
  };
}
