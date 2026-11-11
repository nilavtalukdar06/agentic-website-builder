import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SYSTEM_PROMPT } from "./system";

const rules = readFileSync(
  join(process.cwd(), "sandbox-templates/nextjs/agents-rules.md"),
  "utf8",
);

describe("agent instructions", () => {
  test("the system prompt sends the agent to AGENTS.md and the skills first", () => {
    expect(SYSTEM_PROMPT).toContain("Read AGENTS.md with readFiles");
    expect(SYSTEM_PROMPT).toContain("even for a one-line change");
    expect(SYSTEM_PROMPT).toContain(".agents/skills");
    expect(SYSTEM_PROMPT.indexOf("Before you write any code")).toBeLessThan(
      SYSTEM_PROMPT.indexOf("## Environment"),
    );
  });

  test("the sandbox AGENTS.md rules tell agents to read it and load skills, even for small changes", () => {
    expect(rules).toContain("## Always start here");
    expect(rules).toMatch(
      /Read this file \(`AGENTS\.md`\) in full before you write or change any code/,
    );
    expect(rules).toMatch(
      /Load the available skills before you write or change any code, even for a small change/,
    );
    expect(rules).toContain(".agents/skills/<name>/SKILL.md");
    expect(rules).toMatch(/Never edit `\.agents\/` or `\.claude\/`/);
  });

  test("the rules don't depend on skills being installed", () => {
    expect(rules).toMatch(/If the folder is missing or empty, carry on/);
  });

  test("the rules don't claim a dev server or a src folder", () => {
    expect(rules).toContain("There is no `src/` folder");
    expect(rules).not.toMatch(/npm run dev|next dev/);
  });
});
