import "server-only";
import { Octokit } from "@octokit/rest";
import { retry } from "@octokit/plugin-retry";
import { hasRepositoryScope } from "@/lib/github-export";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { ExportError } from "./errors";

const Github = Octokit.plugin(retry);

export async function githubClient(userId: string, privateRepo: boolean) {
  const account = await db.account.findFirst({
    where: { userId, providerId: "github" },
    select: { id: true, scope: true },
  });
  if (!account || !hasRepositoryScope(account.scope, privateRepo))
    throw new ExportError("AUTH_REQUIRED");
  const tokens = await auth.api
    .getAccessToken({ body: { accountId: account.id, userId } })
    .catch(() => {
      throw new ExportError("AUTH_REQUIRED");
    });
  if (!tokens.accessToken) throw new ExportError("AUTH_REQUIRED");
  return new Github({
    auth: tokens.accessToken,
    userAgent: "Vibe website builder",
    retry: { retries: 2 },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  });
}

export type GithubClient = Awaited<ReturnType<typeof githubClient>>;
