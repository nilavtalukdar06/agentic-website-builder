export const projectTopics = [
  "status",
  "reasoning",
  "text",
  "task",
  "file",
  "tool",
  "credits",
  "preview",
  "search",
  "guard",
] as const;

export const projectChannelName = (projectId: string) => `project:${projectId}`;
