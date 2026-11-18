import type { ToolSet } from "ai";

export type AgentSpec = {
  name: "builder" | "editor" | "repair";
  tools: ToolSet;
  instructions: string;
  output: (text: string) => string | null;
};
