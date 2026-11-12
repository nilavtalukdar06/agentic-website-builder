import type { Sandbox } from "e2b";
import { APP_DIR } from "@/server/sandbox/guards";

export const SKILLS_DIR = ".agents/skills";
export const MAX_SKILL_CHARS = 30_000;
const MAX_DESCRIPTION_CHARS = 600;

export const SKILL_NAMES = [
  "vercel-react-best-practices",
  "next-best-practices",
  "frontend-design",
  "shadcn",
  "vercel-composition-patterns",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export type InstalledSkill = { name: string; description: string };

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function unquote(value: string) {
  const trimmed = value.trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
}

function readField(lines: string[], key: string) {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return null;
  const first = lines[start].slice(key.length + 1).trim();
  const rest: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    rest.push(line.trim());
  }
  const head = /^[>|][-+]?$/.test(first) ? "" : first;
  return unquote([head, ...rest].filter(Boolean).join(" "));
}

export function parseSkill(markdown: string) {
  const match = frontmatterPattern.exec(markdown);
  if (!match) return { name: null, description: null, body: markdown.trim() };
  const lines = match[1].split(/\r?\n/);
  return {
    name: readField(lines, "name"),
    description: readField(lines, "description"),
    body: markdown.slice(match[0].length).trim(),
  };
}

export async function listInstalledSkills(
  sandbox: Pick<Sandbox, "files">,
): Promise<InstalledSkill[]> {
  const found = await Promise.all(
    SKILL_NAMES.map(async (name) => {
      const markdown = await sandbox.files
        .read(`${APP_DIR}/${SKILLS_DIR}/${name}/SKILL.md`)
        .catch(() => null);
      if (markdown === null) return null;
      const description = parseSkill(markdown).description ?? "";
      return {
        name,
        description:
          description.length > MAX_DESCRIPTION_CHARS
            ? `${description.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`
            : description,
      };
    }),
  );
  return found.filter((skill) => skill !== null);
}

export function allowedInstalled(
  installed: readonly InstalledSkill[],
  allowlist: readonly string[],
) {
  return installed.filter((skill) => allowlist.includes(skill.name));
}

export function skillIndex(
  installed: readonly InstalledSkill[],
  allowlist: readonly string[],
) {
  const skills = allowedInstalled(installed, allowlist);
  if (skills.length === 0) {
    return "## Skills\nNo skills are installed in this project. Carry on with the rules in AGENTS.md.";
  }
  const rows = skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");
  return `## Skills\nThese skills are installed in ${SKILLS_DIR}. Load the ones that apply with loadSkill before you work, even for a small change. loadSkill returns the SKILL.md and the list of the skill's other files; read those with readFiles only when you need them.\n${rows}`;
}
