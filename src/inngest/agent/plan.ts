import { z } from "zod";
import { GuardError, resolveAppPath } from "@/server/sandbox/guards";
import { isBlockName } from "./blocks";
import { presetNames } from "./presets";

export const MAX_PLAN_FILES = 40;
export const MAX_FILES_PER_WORKER = 3;
export const MAX_PLAN_CHECKS = 5;
export const fonts = [
  "Geist",
  "Inter",
  "DM Sans",
  "Manrope",
  "Plus Jakarta Sans",
  "Space Grotesk",
  "Outfit",
  "Sora",
  "Playfair Display",
  "Fraunces",
  "Lora",
  "DM Serif Display",
] as const;

const PACKAGE_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

export const buildPlanSchema = z.object({
  title: z
    .string()
    .describe("Short version title, e.g. 'Coffee roastery landing page'."),
  summary: z
    .string()
    .describe("Two or three sentences on what will be built and why."),
  design: z.object({
    preset: z.enum(presetNames),
    headingFont: z.enum(fonts),
    bodyFont: z.enum(fonts),
    theme: z.enum(["system", "light", "dark"]),
    direction: z
      .string()
      .describe("The visual direction in one or two sentences."),
  }),
  pages: z
    .array(
      z.object({
        route: z.string().describe("e.g. / or /pricing"),
        title: z.string(),
        sections: z
          .array(z.string())
          .describe("Section names in order, top to bottom."),
      }),
    )
    .describe("Every route the site has after this change."),
  blocks: z
    .array(z.string())
    .describe("Ready-made blocks to copy into components/blocks, by name."),
  files: z
    .array(
      z.object({
        path: z.string(),
        purpose: z
          .string()
          .describe(
            "What the file contains: its exports, props and content in detail.",
          ),
        dependsOn: z
          .array(z.string())
          .describe("Paths of planned files this file imports."),
      }),
    )
    .describe("Every file to create or rewrite, excluding blocks."),
  packages: z
    .array(z.string())
    .describe("npm packages to install that aren't already installed."),
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
    .describe(
      "Up to 5 key interactions a browser will try after the build, most important first.",
    ),
});

export type BuildPlan = z.infer<typeof buildPlanSchema>;
export type PlanFile = BuildPlan["files"][number];

export type PlanCheck = { plan: BuildPlan; warnings: string[] };

function normalizePath(path: string) {
  try {
    return resolveAppPath(path).relative;
  } catch (error) {
    if (error instanceof GuardError) return null;
    throw error;
  }
}

function breakCycles(files: PlanFile[]) {
  const deps = new Map(files.map((file) => [file.path, file.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const removed: string[] = [];
  const visit = (path: string) => {
    state.set(path, "visiting");
    const kept: string[] = [];
    for (const dep of deps.get(path) ?? []) {
      const seen = state.get(dep);
      if (seen === "visiting") {
        removed.push(`${path} -> ${dep}`);
        continue;
      }
      if (seen === undefined && deps.has(dep)) visit(dep);
      kept.push(dep);
    }
    deps.set(path, kept);
    state.set(path, "done");
  };
  for (const file of files) {
    if (!state.has(file.path)) visit(file.path);
  }
  return {
    files: files.map((file) => ({
      ...file,
      dependsOn: deps.get(file.path) ?? [],
    })),
    removed,
  };
}

export function validatePlan(plan: BuildPlan): PlanCheck {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const files: PlanFile[] = [];
  for (const file of plan.files) {
    const path = normalizePath(file.path);
    if (!path) {
      warnings.push(`dropped ${file.path}: path not allowed`);
      continue;
    }
    if (
      path.startsWith("components/ui/") ||
      path.startsWith("components/blocks/")
    ) {
      warnings.push(`dropped ${path}: provided by the template`);
      continue;
    }
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ ...file, path });
  }
  if (files.length > MAX_PLAN_FILES) {
    warnings.push(`kept the first ${MAX_PLAN_FILES} of ${files.length} files`);
    files.splice(MAX_PLAN_FILES);
  }
  const planned = new Set(files.map((file) => file.path));
  const linked = files.map((file) => ({
    ...file,
    dependsOn: [
      ...new Set(
        file.dependsOn
          .map((dep) => normalizePath(dep))
          .filter((dep): dep is string => !!dep && dep !== file.path)
          .filter((dep) => planned.has(dep)),
      ),
    ],
  }));
  const { files: acyclic, removed } = breakCycles(linked);
  for (const edge of removed) warnings.push(`broke dependency cycle ${edge}`);

  const blocks = [...new Set(plan.blocks)].filter((name) => {
    if (isBlockName(name)) return true;
    warnings.push(`dropped unknown block ${name}`);
    return false;
  });
  const packages = [...new Set(plan.packages.map((name) => name.trim()))]
    .filter((name) => PACKAGE_NAME.test(name))
    .slice(0, 8);

  const routes = new Set(plan.pages.map((page) => normalizeRoute(page.route)));
  const checks = plan.checks
    .map((check) => ({
      route: normalizeRoute(check.route),
      action: check.action.trim().slice(0, 300),
      expect: check.expect.trim().slice(0, 300),
    }))
    .filter((check) => {
      if (check.action && check.expect && routes.has(check.route)) return true;
      warnings.push(`dropped check on ${check.route}`);
      return false;
    })
    .slice(0, MAX_PLAN_CHECKS);

  return {
    plan: { ...plan, files: acyclic, blocks, packages, checks },
    warnings,
  };
}

export function planWaves(
  files: PlanFile[],
  perWorker = MAX_FILES_PER_WORKER,
): PlanFile[][][] {
  const remaining = new Map(files.map((file) => [file.path, file]));
  const done = new Set<string>();
  const waves: PlanFile[][][] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((file) =>
      file.dependsOn.every((dep) => done.has(dep) || !remaining.has(dep)),
    );
    const layer = ready.length > 0 ? ready : [...remaining.values()];
    layer.sort((a, b) => weight(b) - weight(a) || a.path.localeCompare(b.path));
    const groups: PlanFile[][] = [];
    for (let index = 0; index < layer.length; index += perWorker) {
      groups.push(layer.slice(index, index + perWorker));
    }
    waves.push(groups);
    for (const file of layer) {
      remaining.delete(file.path);
      done.add(file.path);
    }
  }
  return waves;
}

export function normalizeRoute(route: string) {
  const trimmed = route.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
}

function weight(file: PlanFile) {
  if (/^app\/(.*\/)?page\.tsx$/.test(file.path)) return 2;
  if (file.path === "app/layout.tsx") return 1;
  return 0;
}
