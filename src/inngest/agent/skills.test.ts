// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  allowedInstalled,
  listInstalledSkills,
  parseSkill,
  skillIndex,
} from "./skills";

describe("parseSkill", () => {
  test("reads a one-line description and strips the frontmatter", () => {
    const skill = parseSkill(
      "---\nname: shadcn\ndescription: Manages shadcn components.\nuser-invocable: false\n---\n\n# shadcn/ui\nBody",
    );
    expect(skill).toEqual({
      name: "shadcn",
      description: "Manages shadcn components.",
      body: "# shadcn/ui\nBody",
    });
  });

  test("joins a folded multi-line description", () => {
    const skill = parseSkill(
      "---\nname: vercel-composition-patterns\ndescription:\n  React composition patterns\n  that scale.\nlicense: MIT\n---\nBody",
    );
    expect(skill.description).toBe("React composition patterns that scale.");
  });

  test("handles block scalars and quotes", () => {
    expect(
      parseSkill('---\nname: "a"\ndescription: >-\n  Folded\n  text\n---\n')
        .description,
    ).toBe("Folded text");
    expect(parseSkill('---\nname: "a"\n---\n').name).toBe("a");
  });

  test("returns the whole file when there is no frontmatter", () => {
    expect(parseSkill("# Title\n")).toEqual({
      name: null,
      description: null,
      body: "# Title",
    });
  });
});

describe("listInstalledSkills", () => {
  test("lists only the skills whose SKILL.md exists", async () => {
    const read = vi.fn(async (path: string) => {
      if (path.endsWith("/shadcn/SKILL.md")) {
        return "---\nname: shadcn\ndescription: UI kit\n---\nBody";
      }
      throw new Error("not found");
    });
    await expect(
      listInstalledSkills({ files: { read } } as never),
    ).resolves.toEqual([{ name: "shadcn", description: "UI kit" }]);
    expect(read).toHaveBeenCalledWith(
      "/home/user/app/.agents/skills/shadcn/SKILL.md",
    );
  });
});

describe("skillIndex", () => {
  const installed = [
    { name: "shadcn", description: "UI kit" },
    { name: "next-best-practices", description: "Next.js rules" },
  ];

  test("lists only the skills on the agent's allowlist", () => {
    const index = skillIndex(installed, ["shadcn", "frontend-design"]);
    expect(index).toContain("- shadcn: UI kit");
    expect(index).not.toContain("next-best-practices");
    expect(allowedInstalled(installed, ["shadcn"])).toHaveLength(1);
  });

  test("says to carry on when nothing applies", () => {
    expect(skillIndex([], ["shadcn"])).toMatch(/No skills are installed/);
  });
});

describe("template skills", () => {
  test("the template lockfile pins exactly the five skills agents use", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { SKILL_NAMES } = await import("./skills");
    const lock = JSON.parse(
      readFileSync(
        join(process.cwd(), "sandbox-templates/nextjs/skills-lock.json"),
        "utf8",
      ),
    ) as { skills: Record<string, { computedHash: string }> };
    expect(Object.keys(lock.skills).sort()).toEqual([...SKILL_NAMES].sort());
    for (const skill of Object.values(lock.skills)) {
      expect(skill.computedHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
