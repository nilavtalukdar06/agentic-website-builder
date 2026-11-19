import type { ToolSet } from "ai";

export type AgentSpec = {
  name: "builder" | "editor";
  tools: ToolSet;
  instructions: string;
  output: (text: string) => string | null;
};
