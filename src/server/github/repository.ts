import "server-only";
import type { GithubClient } from "./client";
import { ExportError } from "./errors";

export type RepositoryTarget = {
  repository: string;
  repositoryUrl: string;
  branch: string;
  baseCommit: string;
};

export function splitRepository(repository: string) {
  const [owner, repo, extra] = repository.split("/");
  if (!owner || !repo || extra) throw new ExportError("FAILED");
  return { owner, repo };
}

export async function ensureRepository(
  client: GithubClient,
  input: {
    id: string;
    name: string;
    private: boolean;
    existing: string | null;
  },
): Promise<RepositoryTarget> {
  const { data: user } = await client.rest.users.getAuthenticated();
  const target = input.existing
    ? splitRepository(input.existing)
    : { owner: user.login, repo: input.name };
  const marker = `Created with Vibe · export ${input.id}`;
  let repository;
  try {
    repository = (await client.rest.repos.get(target)).data;
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    if (input.existing) throw new ExportError("AUTH_REQUIRED");
    try {
      repository = (
        await client.rest.repos.createForAuthenticatedUser({
          name: input.name,
          private: input.private,
          auto_init: true,
          description: marker,
        })
      ).data;
    } catch (createError) {
      if ((createError as { status?: number }).status !== 422)
        throw createError;
      repository = (await client.rest.repos.get(target)).data;
    }
  }
  if (!input.existing && repository.description !== marker)
    throw new ExportError("NAME_TAKEN");
  if (repository.private !== input.private) throw new ExportError("CONFLICT");
  const branch = repository.default_branch;
  const { data: ref } = await client.rest.git.getRef({
    ...splitRepository(repository.full_name),
    ref: `heads/${branch}`,
  });
  return {
    repository: repository.full_name,
    repositoryUrl: repository.html_url,
    branch,
    baseCommit: ref.object.sha,
  };
}

export async function pushCommit(
  client: GithubClient,
  input: RepositoryTarget & { commitSha: string },
) {
  const target = splitRepository(input.repository);
  const { data: current } = await client.rest.git.getRef({
    ...target,
    ref: `heads/${input.branch}`,
  });
  if (current.object.sha === input.commitSha) return;
  if (current.object.sha !== input.baseCommit) {
    const { data: comparison } =
      await client.rest.repos.compareCommitsWithBasehead({
        ...target,
        basehead: `${input.commitSha}...${current.object.sha}`,
      });
    if (comparison.status === "ahead" || comparison.status === "identical")
      return;
    throw new ExportError("CONFLICT");
  }
  await client.rest.git.updateRef({
    ...target,
    ref: `heads/${input.branch}`,
    sha: input.commitSha,
    force: false,
  });
}
