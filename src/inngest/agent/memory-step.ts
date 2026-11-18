import "server-only";
import type { MemoryUse } from "@/server/memory/budget";
import {
  cleanUserWords,
  forgetQuery,
  memoryBlock,
  rememberedText,
} from "@/server/memory/filters";
import type { MemoryAccess } from "@/server/memory";
import type { MemoryItem } from "@/server/memory/types";
import { detectSecrets } from "./guardrails/secret-patterns";
import type { Intent } from "./router";

export const MEMORY_READ_TIMEOUT_MS = 1500;

export type MemoryRead = {
  status: "used" | "empty" | "skipped" | "off";
  reason: string | null;
  block: string;
  reads: number;
  use: MemoryUse;
  ms: number;
};

type EnabledAccess = Extract<MemoryAccess, { enabled: true }>;

function timeout(ms: number) {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("memory read timed out")), ms),
  );
}

export async function readMemory({
  access,
  intent,
  prompt,
  projectId,
  timeoutMs = MEMORY_READ_TIMEOUT_MS,
  now = Date.now,
}: {
  access: MemoryAccess;
  intent: Intent;
  prompt: string;
  projectId: string;
  timeoutMs?: number;
  now?: () => number;
}): Promise<MemoryRead> {
  const started = now();
  const done = (rest: Omit<MemoryRead, "ms">): MemoryRead => ({
    ...rest,
    ms: now() - started,
  });
  if (!access.enabled) {
    return done({
      status: "off",
      reason: access.reason,
      block: "",
      reads: 0,
      use: {},
    });
  }
  if (!access.canRead) {
    return done({
      status: "skipped",
      reason: "the monthly memory budget is used up",
      block: "",
      reads: 0,
      use: {},
    });
  }
  if (intent === "remember" || intent === "forget") {
    return done({
      status: "skipped",
      reason: null,
      block: "",
      reads: 0,
      use: {},
    });
  }
  const { provider, userNs } = access;
  const projectNs = access.projectNs(projectId);
  const wantsProfile = intent !== "question";
  const userQuery = intent === "create";
  const projectQuery = intent !== "create";
  try {
    const [profile, userMatches, projectMatches] = await Promise.race([
      Promise.all([
        wantsProfile ? provider.profile(userNs) : null,
        userQuery ? provider.search(userNs, prompt, { limit: 5 }) : [],
        projectQuery
          ? provider.search(projectNs, prompt, {
              limit: 8,
              threshold: intent === "question" ? undefined : 0.5,
            })
          : [],
      ]),
      timeout(timeoutMs),
    ]);
    const block = memoryBlock({ profile, userMatches, projectMatches });
    const use: MemoryUse = {
      profiles: wantsProfile ? 1 : 0,
      searches: (userQuery ? 1 : 0) + (projectQuery ? 1 : 0),
    };
    const reads =
      (profile ? profile.static.length + profile.dynamic.length : 0) +
      userMatches.length +
      projectMatches.length;
    return done({
      status: block ? "used" : "empty",
      reason: null,
      block,
      reads,
      use,
    });
  } catch (error) {
    console.warn(
      "[memory] read skipped",
      error instanceof Error ? error.message : error,
    );
    return done({
      status: "skipped",
      reason: "memory didn't answer in time",
      block: "",
      reads: 0,
      use: {},
    });
  }
}

export async function memoryWords(prompt: string) {
  const words = cleanUserWords(prompt);
  if (words.length < 3) return null;
  if ((await detectSecrets(words)).length > 0) return null;
  return words;
}

export type MemoryWrite = {
  status: "saved" | "skipped" | "off" | "failed";
  reason: string | null;
  use: MemoryUse;
};

export async function writeUserWords({
  access,
  projectId,
  runId,
  prompt,
}: {
  access: MemoryAccess;
  projectId: string;
  runId: string;
  prompt: string;
}): Promise<MemoryWrite> {
  if (!access.enabled) return { status: "off", reason: access.reason, use: {} };
  if (!access.canWrite) {
    return {
      status: "skipped",
      reason: "the monthly memory budget is nearly used up",
      use: {},
    };
  }
  const words = await memoryWords(prompt);
  if (!words) {
    return { status: "skipped", reason: "nothing safe to remember", use: {} };
  }
  const metadata = { kind: "message", projectId, runId };
  try {
    await Promise.all([
      access.provider.remember(access.projectNs(projectId), {
        id: `run_${runId}_p`,
        content: words,
        metadata,
        instant: true,
      }),
      access.provider.remember(access.userNs, {
        id: `run_${runId}_u`,
        content: words,
        metadata,
        instant: false,
      }),
    ]);
    return {
      status: "saved",
      reason: null,
      use: { writeChars: words.length * 2, instant: 1 },
    };
  } catch (error) {
    console.warn(
      "[memory] write failed",
      error instanceof Error ? error.message : error,
    );
    return { status: "failed", reason: "memory couldn't be saved", use: {} };
  }
}

export type MemoryCommandResult = {
  action: "remember" | "forget";
  status: "saved" | "preview" | "unavailable";
  text: string;
  reason: string | null;
  matches: { id: string; memory: string; scope: "user" | "project" }[];
  use: MemoryUse;
};

function unavailable(
  action: MemoryCommandResult["action"],
  text: string,
  reason: string,
): MemoryCommandResult {
  return { action, status: "unavailable", text, reason, matches: [], use: {} };
}

export async function runMemoryCommand({
  access,
  action,
  prompt,
  projectId,
  runId,
}: {
  access: MemoryAccess;
  action: "remember" | "forget";
  prompt: string;
  projectId: string;
  runId: string;
}): Promise<MemoryCommandResult> {
  const text =
    action === "remember" ? rememberedText(prompt) : forgetQuery(prompt);
  if (!access.enabled) return unavailable(action, text, access.reason);
  const enabled: EnabledAccess = access;

  if (action === "remember") {
    if (!enabled.canWrite) {
      return unavailable(
        action,
        text,
        "the monthly memory budget is nearly used up",
      );
    }
    const words = await memoryWords(text);
    if (!words)
      return unavailable(action, text, "there was nothing safe to remember");
    try {
      await enabled.provider.remember(enabled.userNs, {
        id: `run_${runId}_remember`,
        content: words,
        metadata: { kind: "remember", projectId, runId },
        instant: true,
      });
    } catch {
      return unavailable(action, text, "memory couldn't be saved right now");
    }
    return {
      action,
      status: "saved",
      text: words,
      reason: null,
      matches: [],
      use: { writeChars: words.length, instant: 1 },
    };
  }

  if (!enabled.canRead) {
    return unavailable(action, text, "the monthly memory budget is used up");
  }
  if (!text) return unavailable(action, text, "it wasn't clear what to forget");
  try {
    const [user, project] = await Promise.all([
      enabled.provider.previewForget(enabled.userNs, text),
      enabled.provider.previewForget(enabled.projectNs(projectId), text),
    ]);
    const tag = (scope: "user" | "project") => (item: MemoryItem) => ({
      id: item.id,
      memory: item.memory,
      scope,
    });
    return {
      action,
      status: "preview",
      text,
      reason: null,
      matches: [...user.map(tag("user")), ...project.map(tag("project"))].slice(
        0,
        20,
      ),
      use: { searches: 2 },
    };
  } catch {
    return unavailable(action, text, "memory couldn't be searched right now");
  }
}

export function memoryCommandReply(result: MemoryCommandResult) {
  if (result.status === "unavailable") {
    return `I couldn't do that: ${result.reason}.`;
  }
  if (result.action === "remember") {
    return `Got it. I'll remember this for your future builds:\n\n> ${result.text}\n\nYou can review or remove it any time under **Memory** in your account menu.`;
  }
  if (result.matches.length === 0) {
    return `I don't remember anything matching "${result.text}".`;
  }
  return `I found ${result.matches.length} ${result.matches.length === 1 ? "thing" : "things"} I remember that match "${result.text}". Confirm below to forget ${result.matches.length === 1 ? "it" : "them"}.`;
}
