import { describe, expect, test } from "vitest";
import {
  MAX_PLAN_CHECKS,
  mergePlan,
  normalizeRoute,
  planText,
  untestableReason,
  updatePlanInput,
} from "./plan";

describe("mergePlan", () => {
  test("normalizes check routes, drops empty checks and caps their count", () => {
    const { plan } = mergePlan(undefined, {
      steps: [{ step: "Build", status: "pending" }],
      checks: [
        { route: "/tasks", action: " ", expect: "Open" },
        ...Array.from({ length: 8 }, (_, index) => ({
          route: "tasks/?view=list",
          action: ` Add task ${index} `,
          expect: " The task appears ",
        })),
      ],
    });
    expect(plan.checks).toHaveLength(MAX_PLAN_CHECKS);
    expect(plan.checks[0]).toEqual({
      route: "/tasks",
      action: "Add task 0",
      expect: "The task appears",
    });
  });

  test("keeps the name, title and checks from earlier updates", () => {
    const first = mergePlan(undefined, {
      projectName: "Task Flow",
      title: "Todo app",
      steps: [{ step: "List", status: "in_progress" }],
      checks: [{ route: "/", action: "Add", expect: "Shown" }],
    });
    const second = mergePlan(first.plan, {
      steps: [{ step: "List", status: "done" }],
    });
    expect(second.plan).toMatchObject({
      projectName: "Task Flow",
      title: "Todo app",
      checks: first.plan.checks,
    });
    expect(second.labels).toEqual(["Done: List"]);
    expect(mergePlan(second.plan, { steps: second.plan.steps }).labels).toEqual(
      [],
    );
  });

  test("planText marks each status", () => {
    const { plan } = mergePlan(undefined, {
      steps: [
        { step: "A", status: "done" },
        { step: "B", status: "in_progress" },
        { step: "C", status: "pending" },
      ],
    });
    expect(planText(plan)).toBe("[x] A\n[~] B\n[ ] C");
  });
});

test("the tool input requires at least one step", () => {
  expect(updatePlanInput.safeParse({ steps: [] }).success).toBe(false);
});

test.each([
  ["/", "/"],
  ["pricing/", "/pricing"],
  ["/blog?x=1#top", "/blog"],
])("normalizeRoute(%s)", (input, output) => {
  expect(normalizeRoute(input)).toBe(output);
});

describe("browser checks the browser can't perform", () => {
  test("drops navigation, resizing and styling checks and keeps real interactions", () => {
    const { plan, dropped } = mergePlan(undefined, {
      steps: [{ step: "Dashboard", status: "pending" }],
      checks: [
        {
          route: "/",
          action: "Open the dashboard home page",
          expect: "The dashboard is shown",
        },
        {
          route: "/",
          action: "Resize the viewport to mobile width",
          expect: "The sidebar collapses",
        },
        {
          route: "/",
          action: "Click a sidebar nav item",
          expect: "The item shows an active highlight",
        },
        {
          route: "/customers",
          action: "Type Ada into the search box",
          expect: "Only rows containing Ada are listed",
        },
      ],
    });
    expect(plan.checks.map((check) => check.action)).toEqual([
      "Type Ada into the search box",
    ]);
    expect(dropped).toHaveLength(3);
    expect(dropped[0]).toContain("Open the dashboard home page");
    expect(dropped[2]).toContain("styling");
  });

  test("untestableReason accepts clicks and typed entries", () => {
    expect(
      untestableReason({ action: "Click Add task", expect: "A new row" }),
    ).toBeNull();
  });
});
