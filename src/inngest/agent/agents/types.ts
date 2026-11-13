import type { ToolSet } from "ai";
import type { SkillName } from "../skills";

export type AgentSpec = {
  name: "builder";
  tools: ToolSet;
  skills: readonly SkillName[];
  instructions: (skillIndex: string) => string;
  output: (text: string) => string | null;
};
