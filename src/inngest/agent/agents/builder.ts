import { extractSummary } from "../conversation";
import { builderInstructions } from "../prompts/system";
import { SKILL_NAMES } from "../skills";
import { builderTools } from "../tools";
import type { AgentSpec } from "./types";

export const BUILDER_MAX_TURNS = 60;
export const FIX_PASS_MAX_TURNS = 15;

export const builder: AgentSpec = {
  name: "builder",
  tools: builderTools,
  skills: SKILL_NAMES,
  maxTurns: BUILDER_MAX_TURNS,
  instructions: builderInstructions,
  output: extractSummary,
  textFallback: true,
};
