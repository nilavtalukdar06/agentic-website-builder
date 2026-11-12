import { extractTag } from "../conversation";
import { NO_FINDINGS, REVIEWER_PROMPT } from "../prompts/reviewer";
import { FINDINGS_TAG } from "../prompts/system";
import { SKILL_NAMES } from "../skills";
import { reviewerTools } from "../tools";
import type { AgentSpec } from "./types";

export const reviewer: AgentSpec = {
  name: "reviewer",
  tools: reviewerTools,
  skills: SKILL_NAMES,
  maxTurns: 8,
  instructions: (skills) => `${REVIEWER_PROMPT}\n\n${skills}`,
  output: (text) => extractTag(text, FINDINGS_TAG),
  textFallback: false,
};

export function hasFindings(findings: string | null) {
  if (!findings) return false;
  return (
    findings
      .trim()
      .replace(/^["'\s]+|[.\s"']+$/g, "")
      .toLowerCase() !== NO_FINDINGS
  );
}
