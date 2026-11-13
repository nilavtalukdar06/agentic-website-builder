import "server-only";
import type { AgentName } from "@/lib/agent/parts";
import { builder } from "./builder";
import { designer } from "./designer";
import { researcher } from "./researcher";
import { reviewer } from "./reviewer";
import type { AgentSpec } from "./types";

export const agentSpecs: Record<AgentName, AgentSpec> = {
  researcher,
  designer,
  builder,
  reviewer,
};

export { fastBuilder } from "./builder";
export type { AgentSpec } from "./types";
