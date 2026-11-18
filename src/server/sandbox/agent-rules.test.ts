import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { AGENT_RULES, AGENT_RULES_MARKER, withAgentRules } from "./agent-rules";

const managedBlock =
  "<!-- BEGIN:nextjs-agent-rules -->\n# Next.js\n<!-- END:nextjs-agent-rules -->\n";

describe("AGENT_RULES", () => {
  test("matches the rules the template build merges into AGENTS.md", () => {
    const file = readFileSync(
      join(process.cwd(), "sandbox-templates/nextjs/agents-rules.md"),
      "utf8",
    );
    expect(AGENT_RULES).toBe(file);
    expect(AGENT_RULES).toContain(AGENT_RULES_MARKER);
  });
});

describe("withAgentRules", () => {
  test("puts the rules above the block next dev manages", () => {
    const patched = withAgentRules(managedBlock);
    expect(patched).not.toBeNull();
    expect(patched!.startsWith(AGENT_RULES)).toBe(true);
    expect(patched!.indexOf(AGENT_RULES_MARKER)).toBeLessThan(
      patched!.indexOf("BEGIN:nextjs-agent-rules"),
    );
    expect(patched).toContain(managedBlock);
  });

  test("leaves a file that already has the rules alone", () => {
    expect(withAgentRules(`${AGENT_RULES}${managedBlock}`)).toBeNull();
  });

  test("replaces the old load-skills-first rules and keeps the managed block", () => {
    const legacy = `# Instructions for AI coding agents\n\n## Always start here\n\n1. Read this file.\n\n${managedBlock}`;
    const patched = withAgentRules(legacy);
    expect(patched).toBe(`${AGENT_RULES}\n${managedBlock}`);
    expect(patched).not.toContain("Always start here");
  });

  test("replaces old rules without a managed block with the new rules", () => {
    expect(withAgentRules("## Always start here\nold")).toBe(AGENT_RULES);
  });

  test("writes the rules when AGENTS.md is missing or empty", () => {
    expect(withAgentRules(null)).toBe(AGENT_RULES);
    expect(withAgentRules("")).toBe(AGENT_RULES);
  });
});
