import { extractTag } from "../conversation";
import { DESIGNER_PROMPT } from "../prompts/designer";
import { BRIEF_TAG } from "../prompts/system";
import { designerTools } from "../tools";
import type { AgentSpec } from "./types";

export const designer: AgentSpec = {
  name: "designer",
  tools: designerTools,
  skills: ["frontend-design", "shadcn"],
  maxTurns: 4,
  instructions: (skills) => `${DESIGNER_PROMPT}\n\n${skills}`,
  output: (text) => extractTag(text, BRIEF_TAG),
  textFallback: false,
};
