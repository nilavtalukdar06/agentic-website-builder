import { extractSummary } from "../conversation";
import {
  builderInstructions,
  fastBuilderInstructions,
} from "../prompts/system";
import { SKILL_NAMES } from "../skills";
import { builderTools } from "../tools";
import type { AgentSpec } from "./types";

export const builder: AgentSpec = {
  name: "builder",
  tools: builderTools,
  skills: SKILL_NAMES,
  maxTurns: Number.POSITIVE_INFINITY,
  instructions: builderInstructions,
  output: extractSummary,
  textFallback: true,
};

export const fastBuilder: AgentSpec = {
  ...builder,
  instructions: fastBuilderInstructions,
};
