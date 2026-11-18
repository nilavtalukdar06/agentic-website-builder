import type { PrismaClient } from "@/generated/prisma/client";
import { emailAllowance, recordEmailSent } from "./budget";
import { decideNotification, type NotificationKind } from "./notify";
import { renderNotification } from "./templates";
import type { EmailProvider } from "./types";

export type NotifyRequest = {
  kind: NotificationKind;
  userId: string;
  projectId: string;
  messageId?: string;
  exportId?: string;
  key: string;
};

export type DeliveryOutcome =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: string }
  | { status: "rejected"; reason: string };

export class EmailRetry extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EmailRetry";
  }
}

type DeliverDb = Pick<
  PrismaClient,
  "user" | "project" | "message" | "githubExport" | "emailUsage"
>;

export async function deliverNotification({
  db,
  provider,
  request,
  appUrl,
  dailyLimit,
  alert,
  now = Date.now,
}: {
  db: DeliverDb;
  provider: EmailProvider;
  request: NotifyRequest;
  appUrl: string;
  dailyLimit: number;
  alert: (details: Record<string, number | string>) => Promise<unknown>;
  now?: () => number;
}): Promise<DeliveryOutcome> {
  const [user, project] = await Promise.all([
    db.user.findUnique({
      where: { id: request.userId },
      select: { email: true, notifyEmail: true },
    }),
    db.project.findFirst({
      where: { id: request.projectId, userId: request.userId },
      select: { name: true, slug: true },
    }),
  ]);
  if (!user || !project) return { status: "skipped", reason: "missing-data" };

  let durationMs: number | null = null;
  if (request.messageId) {
    const message = await db.message.findFirst({
      where: {
        id: request.messageId,
        projectId: request.projectId,
        role: "USER",
      },
      select: { startedAt: true },
    });
    durationMs = message?.startedAt
      ? now() - message.startedAt.getTime()
      : null;
  }
  let repositoryUrl: string | null = null;
  if (request.exportId) {
    const job = await db.githubExport.findFirst({
      where: {
        id: request.exportId,
        projectId: request.projectId,
        userId: request.userId,
      },
      select: { repositoryUrl: true },
    });
    repositoryUrl = job?.repositoryUrl ?? null;
  }

  const allowance = await emailAllowance(db, dailyLimit, now());
  const decision = decideNotification({
    kind: request.kind,
    email: user.email,
    optedIn: user.notifyEmail,
    durationMs,
    canSendRoutine: allowance.canSendRoutine,
    canSendImportant: allowance.canSendImportant,
  });
  if (!decision.send) return { status: "skipped", reason: decision.reason };

  const base = appUrl.replace(/\/$/u, "");
  const content = renderNotification({
    kind: request.kind,
    projectName: project.name,
    projectUrl: `${base}/p/${project.slug}`,
    usageUrl: `${base}/usage`,
    settingsUrl: base,
    repositoryUrl,
  });
  const result = await provider.send({
    to: user.email,
    ...content,
    idempotencyKey: `notify/${request.kind}/${request.key}`.slice(0, 256),
  });
  if (result.status === "retry") throw new EmailRetry(result.reason);
  if (result.status === "rejected") {
    return { status: "rejected", reason: result.reason };
  }
  await recordEmailSent(db, dailyLimit, alert, now());
  return { status: "sent", id: result.id };
}
