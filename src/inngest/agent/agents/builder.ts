import "server-only";
import { gateway } from "@/server/ai/gateway";
import { extractSummary } from "../conversation";
import { builderInstructions } from "../prompts/system";
import { SEARCH_TOOL } from "../search";
import { builderTools } from "../tools";
import type { AgentSpec } from "./types";

export function builderSpec({
  search,
  name = "builder",
}: {
  search: boolean;
  name?: AgentSpec["name"];
}): AgentSpec {
  return {
    name,
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
    instructions: builderInstructions(search),
    output: extractSummary,
  };
}
