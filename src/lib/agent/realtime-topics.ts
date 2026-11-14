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
  "export",
] as const;

export const projectChannelName = (projectId: string) => `project:${projectId}`;
