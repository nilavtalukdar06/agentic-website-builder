export const AGENT_MODES = ["standard", "fast"] as const;

export type AgentModeName = (typeof AGENT_MODES)[number];

export function isAgentMode(value: unknown): value is AgentModeName {
  return AGENT_MODES.some((mode) => mode === value);
}

export const DEFAULT_AGENT_MODE: AgentModeName = "standard";

export function toDbMode(mode: AgentModeName) {
  return mode === "fast" ? ("FAST" as const) : ("STANDARD" as const);
}

export function fromDbMode(mode: "STANDARD" | "FAST" | null | undefined) {
  return mode === "FAST" ? ("fast" as const) : ("standard" as const);
}
