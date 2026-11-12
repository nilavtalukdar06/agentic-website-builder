import "server-only";
import { gateway } from "@/server/ai/gateway";
import { extractTag } from "../conversation";
import { RESEARCHER_PROMPT } from "../prompts/researcher";
import { BRIEF_TAG } from "../prompts/system";
import { SEARCH_TOOL } from "../search";
import { researcherTools } from "../tools";
import type { AgentSpec } from "./types";

export const researcher: AgentSpec = {
  name: "researcher",
  tools: {
    ...researcherTools,
    [SEARCH_TOOL]: gateway.tools.parallelSearch({
      mode: "basic",
      maxResults: 5,
      maxCharsTotal: 6000,
    }),
  },
  skills: [],
  maxTurns: 6,
  instructions: () => RESEARCHER_PROMPT,
  output: (text) => extractTag(text, BRIEF_TAG),
  textFallback: false,
};
