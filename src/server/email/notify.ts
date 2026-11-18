export const notificationKinds = [
  "run-finished",
  "run-failed",
  "run-out-of-credits",
  "export-finished",
  "export-failed",
] as const;

export type NotificationKind = (typeof notificationKinds)[number];

export const MIN_FINISH_MS = 60_000;

const routine = new Set<NotificationKind>(["run-finished", "export-finished"]);

export const isRoutine = (kind: NotificationKind) => routine.has(kind);

export type Decision =
  | { send: true }
  | {
      send: false;
      reason: "no-email" | "opted-out" | "too-fast" | "budget" | "missing-data";
    };

export function decideNotification({
  kind,
  email,
  optedIn,
  durationMs,
  canSendRoutine,
  canSendImportant,
}: {
  kind: NotificationKind;
  email: string | null;
  optedIn: boolean;
  durationMs: number | null;
  canSendRoutine: boolean;
  canSendImportant: boolean;
}): Decision {
  if (!email) return { send: false, reason: "no-email" };
  if (!optedIn) return { send: false, reason: "opted-out" };
  if (
    kind === "run-finished" &&
    (durationMs === null || durationMs < MIN_FINISH_MS)
  ) {
    return { send: false, reason: "too-fast" };
  }
  const allowed = isRoutine(kind) ? canSendRoutine : canSendImportant;
  return allowed ? { send: true } : { send: false, reason: "budget" };
}
