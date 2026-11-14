import { NonRetriableError } from "inngest";

export const exportErrors = {
  AUTH_REQUIRED:
    "Connect GitHub and allow repository access, then retry the export.",
  NAME_TAKEN:
    "A repository with that name already exists. Choose another name.",
  CONFLICT:
    "The GitHub branch changed during export. Start a new export to keep those changes safe.",
  SNAPSHOT:
    "This project has no complete saved version to export. Build a version first.",
  SECRET: "The project contains a detected secret. Remove it before exporting.",
  TOO_LARGE:
    "The project exceeds the export limits. Reduce large files before exporting.",
  RECOVERY:
    "Couldn't recover the saved project in its sandbox. Retry the export.",
  UNAVAILABLE: "GitHub is temporarily unavailable. Retry the export.",
  FAILED: "Couldn't export this project. Retry the export.",
} as const;

export type ExportErrorCode = keyof typeof exportErrors;

export class ExportError extends NonRetriableError {
  constructor(public readonly code: ExportErrorCode) {
    super(exportErrors[code]);
  }
}

export async function githubRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ExportError) throw error;
    const status = (error as { status?: number }).status;
    const headers = (
      error as { response?: { headers?: Record<string, string> } }
    ).response?.headers;
    if (
      status === 403 &&
      (headers?.["x-ratelimit-remaining"] === "0" || headers?.["retry-after"])
    )
      throw new Error(exportErrors.UNAVAILABLE);
    if (status === 401 || status === 403)
      throw new ExportError("AUTH_REQUIRED");
    if (status === 409 || status === 422) throw new ExportError("CONFLICT");
    throw new Error(exportErrors.UNAVAILABLE);
  }
}
