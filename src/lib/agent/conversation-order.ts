type Orderable = {
  id: string;
  role: "USER" | "ASSISTANT";
  replyToId: string | null;
};

export function orderConversation<T extends Orderable>(messages: T[]): T[] {
  const ids = new Set(messages.map((message) => message.id));
  const replies = new Map<string, T[]>();
  const ordered: T[] = [];
  for (const message of messages) {
    if (
      message.role === "ASSISTANT" &&
      message.replyToId &&
      ids.has(message.replyToId)
    ) {
      const list = replies.get(message.replyToId) ?? [];
      list.push(message);
      replies.set(message.replyToId, list);
    }
  }
  for (const message of messages) {
    if (
      message.role === "ASSISTANT" &&
      message.replyToId &&
      ids.has(message.replyToId)
    ) {
      continue;
    }
    ordered.push(message, ...(replies.get(message.id) ?? []));
  }
  return ordered;
}
