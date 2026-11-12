import type { ToolSet } from "ai";
import type { AgentName } from "@/lib/agent/parts";
import type { SkillName } from "../skills";

export type AgentSpec = {
  name: AgentName;
  tools: ToolSet;
  skills: readonly SkillName[];
  maxTurns: number;
  instructions: (skillIndex: string) => string;
  output: (text: string) => string | null;
  textFallback: boolean;
};
