import { z } from "zod";

export const exportStatuses = [
  "QUEUED",
  "RECOVERING",
  "PREPARING",
  "PUSHING",
  "SUCCEEDED",
  "FAILED",
] as const;
export type ExportStatus = (typeof exportStatuses)[number];

export const exportLabels: Record<ExportStatus, string> = {
  QUEUED: "Export queued",
  RECOVERING: "Waking up the sandbox",
  PREPARING: "Preparing files",
  PUSHING: "Pushing to GitHub",
  SUCCEEDED: "Pushed to GitHub",
  FAILED: "Export failed",
};

export const exportProgress: Record<ExportStatus, number> = {
  QUEUED: 10,
  RECOVERING: 35,
  PREPARING: 60,
  PUSHING: 85,
  SUCCEEDED: 100,
  FAILED: 100,
};

export const isExportActive = (status?: string | null) =>
  status !== undefined &&
  status !== null &&
  !["SUCCEEDED", "FAILED"].includes(status);

export const repositoryName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Use letters, numbers, dots, hyphens or underscores.",
  )
  .refine((name) => ![".", ".."].includes(name), "Choose a repository name.");

export const exportEventSchema = z.object({
  exportId: z.string(),
  status: z.enum(exportStatuses),
  repositoryUrl: z.url().nullable().optional(),
  commitSha: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export function hasRepositoryScope(
  scope: string | null | undefined,
  privateRepo: boolean,
) {
  const scopes = (scope ?? "").split(/[,\s]+/);
  return (
    scopes.includes("repo") || (!privateRepo && scopes.includes("public_repo"))
  );
}
