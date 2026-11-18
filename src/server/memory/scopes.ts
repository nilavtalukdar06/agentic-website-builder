const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TAG = /^[a-f0-9]{8,32}$/;

export class MemoryScopeError extends Error {}

function checked(id: string, tag: string) {
  if (!ID.test(id)) throw new MemoryScopeError("Invalid memory scope id.");
  if (!TAG.test(tag)) throw new MemoryScopeError("Invalid database tag.");
}

export function userNamespace(userId: string, tag: string) {
  checked(userId, tag);
  return `vibe:${tag}:u:${userId}`;
}

export function projectNamespace(projectId: string, tag: string) {
  checked(projectId, tag);
  return `vibe:${tag}:p:${projectId}`;
}
