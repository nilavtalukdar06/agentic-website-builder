import { HOUSE_RULES } from "@/inngest/agent/prompts/house-rules";

export const AGENT_RULES_MARKER = "## House rules";
const LEGACY_MARKER = "## Always start here";
const MANAGED_BLOCK = "<!-- BEGIN:nextjs-agent-rules";

export const AGENT_RULES = `# Instructions for AI coding agents

These rules apply to every AI agent that writes or changes code in this project.

${AGENT_RULES_MARKER}

- Never edit \`.agents/\`, \`.claude/\` or \`.vibe/\`. They are read-only.
- Before you use a Next.js API you are not certain about, read the matching guide in \`node_modules/next/dist/docs/\`.
- Check your work before you finish: run \`npx tsc --noEmit\` and fix what it reports.

${HOUSE_RULES}
`;

export function withAgentRules(source: string | null) {
  if (source?.includes(AGENT_RULES_MARKER)) return null;
  if (!source) return AGENT_RULES;
  if (source.includes(LEGACY_MARKER)) {
    const managed = source.indexOf(MANAGED_BLOCK);
    return managed === -1
      ? AGENT_RULES
      : `${AGENT_RULES}\n${source.slice(managed)}`;
  }
  return `${AGENT_RULES}\n${source}`;
}
