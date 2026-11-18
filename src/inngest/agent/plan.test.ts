import { describe, expect, test } from "vitest";
import {
  type BuildPlan,
  MAX_PLAN_CHECKS,
  MAX_PLAN_FILES,
  planWaves,
  validatePlan,
} from "./plan";

function plan(overrides: Partial<BuildPlan> = {}): BuildPlan {
  return {
    projectName: "Ember & Oak",
    title: "Ember & Oak",
    summary: "A coffee roastery site.",
    design: {
      preset: "sunset",
      headingFont: "Fraunces",
      bodyFont: "Inter",
      theme: "system",
      direction: "Warm and editorial.",
    },
    pages: [{ route: "/", title: "Home", sections: ["Hero", "Menu"] }],
    blocks: ["site-header", "hero-centered"],
    files: [
      { path: "lib/data.ts", purpose: "menu data", dependsOn: [] },
      {
        path: "components/menu.tsx",
        purpose: "Menu section",
        dependsOn: ["lib/data.ts"],
      },
      {
        path: "app/page.tsx",
        purpose: "Home page",
        dependsOn: ["components/menu.tsx", "lib/data.ts"],
      },
      { path: "app/layout.tsx", purpose: "Layout", dependsOn: [] },
    ],
    packages: [],
    checks: [],
    ...overrides,
  };
}

describe("validatePlan", () => {
  test("keeps only actionable checks for planned routes and caps their count", () => {
    const { plan: checked, warnings } = validatePlan(
      plan({
        pages: [{ route: "/tasks/", title: "Tasks", sections: ["List"] }],
        checks: [
          { route: "/missing", action: "Click", expect: "Open" },
          { route: "/tasks", action: " ", expect: "Open" },
          ...Array.from({ length: 8 }, (_, index) => ({
            route: "tasks/?view=list",
            action: ` Add task ${index} `,
            expect: " The task appears ",
          })),
        ],
      }),
    );
    expect(checked.checks).toHaveLength(MAX_PLAN_CHECKS);
    expect(checked.checks[0]).toEqual({
      route: "/tasks",
      action: "Add task 0",
      expect: "The task appears",
    });
    expect(warnings).toHaveLength(2);
  });

  test("bounds browser instructions before they reach the browser model", () => {
    const { plan: checked } = validatePlan(
      plan({
        checks: [
          { route: "/", action: "a".repeat(400), expect: "b".repeat(400) },
        ],
      }),
    );
    expect(checked.checks[0].action).toHaveLength(300);
    expect(checked.checks[0].expect).toHaveLength(300);
  });

  test("keeps a valid plan as it is", () => {
    const input = plan();
    expect(validatePlan(input)).toEqual({ plan: input, warnings: [] });
  });

  test("drops unsafe, template-owned and duplicate paths", () => {
    const { plan: checked, warnings } = validatePlan(
      plan({
        files: [
          { path: "./app/page.tsx", purpose: "p", dependsOn: [] },
          { path: "app/page.tsx", purpose: "dup", dependsOn: [] },
          { path: "../outside.ts", purpose: "x", dependsOn: [] },
          { path: ".env.local", purpose: "x", dependsOn: [] },
          { path: "components/ui/button.tsx", purpose: "x", dependsOn: [] },
          { path: "components/blocks/faq.tsx", purpose: "x", dependsOn: [] },
        ],
      }),
    );
    expect(checked.files.map((file) => file.path)).toEqual(["app/page.tsx"]);
    expect(warnings).toHaveLength(4);
  });

  test("drops dependencies on unplanned files and breaks cycles", () => {
    const { plan: checked, warnings } = validatePlan(
      plan({
        files: [
          {
            path: "a.ts",
            purpose: "a",
            dependsOn: ["b.ts", "nope.ts", "a.ts"],
          },
          { path: "b.ts", purpose: "b", dependsOn: ["a.ts"] },
        ],
      }),
    );
    const deps = Object.fromEntries(
      checked.files.map((file) => [file.path, file.dependsOn]),
    );
    expect(deps["a.ts"]).toEqual(["b.ts"]);
    expect(deps["b.ts"]).toEqual([]);
    expect(warnings).toEqual(["broke dependency cycle b.ts -> a.ts"]);
  });

  test("drops unknown blocks and invalid package names, and caps files", () => {
    const { plan: checked } = validatePlan(
      plan({
        blocks: ["faq", "mega-menu"],
        packages: ["motion", "motion", "rm -rf /", "@scope/pkg"],
        files: Array.from({ length: 50 }, (_, index) => ({
          path: `components/c${index}.tsx`,
          purpose: "c",
          dependsOn: [],
        })),
      }),
    );
    expect(checked.blocks).toEqual(["faq"]);
    expect(checked.packages).toEqual(["motion", "@scope/pkg"]);
    expect(checked.files).toHaveLength(MAX_PLAN_FILES);
  });
});

describe("plan checks", () => {
  test("keeps checks on planned routes, normalised, and caps them at five", () => {
    const { plan: checked, warnings } = validatePlan(
      plan({
        checks: [
          { route: "/", action: "Add a task", expect: "It is listed" },
          { route: "/about/", action: "Open the menu", expect: "Links show" },
          { route: "/missing", action: "x", expect: "y" },
          ...Array.from({ length: 6 }, (_, index) => ({
            route: "",
            action: `Step ${index}`,
            expect: "ok",
          })),
        ],
        pages: [
          { route: "/", title: "Home", sections: [] },
          { route: "/about", title: "About", sections: [] },
        ],
      }),
    );
    expect(checked.checks).toHaveLength(5);
    expect(checked.checks[1]).toEqual({
      route: "/about",
      action: "Open the menu",
      expect: "Links show",
    });
    expect(checked.checks[2].route).toBe("/");
    expect(warnings).toContain("dropped check on /missing");
  });
});

describe("planWaves", () => {
  test("orders files by dependency layer, pages first within a layer", () => {
    const waves = planWaves(plan().files, 3);
    expect(
      waves.map((groups) => groups.map((group) => group.map((f) => f.path))),
    ).toEqual([
      [["app/layout.tsx", "lib/data.ts"]],
      [["components/menu.tsx"]],
      [["app/page.tsx"]],
    ]);
  });

  test("splits a wide layer into worker groups", () => {
    const files = Array.from({ length: 7 }, (_, index) => ({
      path: `components/c${index}.tsx`,
      purpose: "c",
      dependsOn: [],
    }));
    const [wave] = planWaves(files, 3);
    expect(wave.map((group) => group.length)).toEqual([3, 3, 1]);
  });

  test("still finishes when dependencies can't be satisfied", () => {
    const waves = planWaves([
      { path: "a.ts", purpose: "a", dependsOn: ["b.ts"] },
      { path: "b.ts", purpose: "b", dependsOn: ["a.ts"] },
    ]);
    expect(
      waves
        .flat(2)
        .map((file) => file.path)
        .sort(),
    ).toEqual(["a.ts", "b.ts"]);
  });
});
