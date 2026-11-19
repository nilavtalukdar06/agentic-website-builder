import { z } from "zod";

export const MAX_PLAN_STEPS = 12;
export const MAX_PLAN_CHECKS = 5;
export const planStatuses = ["pending", "in_progress", "done"] as const;

export const updatePlanInput = z.object({
  projectName: z
    .string()
    .max(80)
    .optional()
    .describe(
      "New sites only: the product or site name, one to three words in Title Case, e.g. 'Ember & Oak'. Never a sentence.",
    ),
  title: z
    .string()
    .max(120)
    .optional()
    .describe("Short title of this change, e.g. 'Coffee roastery landing'."),
  steps: z
    .array(
      z.object({
        step: z.string().min(1).max(160),
        status: z.enum(planStatuses),
      }),
    )
    .min(1)
    .max(MAX_PLAN_STEPS)
    .describe("The whole checklist, every time, with each step's status."),
  checks: z
    .array(
      z.object({
        route: z.string().describe("The page to start on, e.g. /"),
        action: z
          .string()
          .describe(
            "One user action in plain words, e.g. 'Type Buy milk in the new task field and press Enter'.",
          ),
        expect: z
          .string()
          .describe(
            "What must be visible afterwards, e.g. 'A task called Buy milk appears in the list'.",
          ),
      }),
    )
    .max(MAX_PLAN_CHECKS)
    .optional()
    .describe(
      "Up to 5 key interactions a real browser will try when you finish, most important first.",
    ),
});

export type PlanInput = z.infer<typeof updatePlanInput>;
export type PlanStep = PlanInput["steps"][number];
export type PlanCheck = { route: string; action: string; expect: string };
export type RunPlan = {
  projectName?: string;
  title?: string;
  steps: PlanStep[];
  checks: PlanCheck[];
};

export function normalizeRoute(route: string) {
  const trimmed = route.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
}

export function mergePlan(previous: RunPlan | undefined, input: PlanInput) {
  const checks = (input.checks ?? previous?.checks ?? [])
    .map((check) => ({
      route: normalizeRoute(check.route),
      action: check.action.trim().slice(0, 300),
      expect: check.expect.trim().slice(0, 300),
    }))
    .filter((check) => check.action && check.expect)
    .slice(0, MAX_PLAN_CHECKS);
  const steps = input.steps.map((item) => ({
    step: item.step.trim(),
    status: item.status,
  }));
  const plan: RunPlan = {
    projectName: input.projectName?.trim() || previous?.projectName,
    title: input.title?.trim() || previous?.title,
    steps,
    checks,
  };
  const before = new Map(
    (previous?.steps ?? []).map((item) => [item.step, item.status]),
  );
  const labels = previous
    ? steps
        .filter(
          (item) => item.status === "done" && before.get(item.step) !== "done",
        )
        .map((item) => `Done: ${item.step}`)
    : [`Plan: ${steps.map((item) => item.step).join(" · ")}`];
  return { plan, labels };
}

export function planText(plan: RunPlan) {
  const mark = { pending: "[ ]", in_progress: "[~]", done: "[x]" } as const;
  return plan.steps
    .map((item) => `${mark[item.status]} ${item.step}`)
    .join("\n");
}
