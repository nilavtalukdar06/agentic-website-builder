import type { projectChannel } from "@/inngest/channels";
import type { fileVerbs, Source, TaskItem } from "./parts";
import { stripSummaryTags } from "./parts";

type Topics = typeof projectChannel.$infer;

export type LiveEvent = {
  [K in keyof Topics]: { topic: K; data: Topics[K] };
}[keyof Topics];

export type AgentState = Topics["status"]["state"];

export const terminalStates: readonly AgentState[] = [
  "done",
  "error",
  "stopped",
];

export type LiveTool = {
  callId: string;
  name: string;
  command: string | null;
  output: string;
  exitCode: number | null;
  done: boolean;
};

export type LiveFile = {
  path: string;
  verb: (typeof fileVerbs)[number];
  lines: number | null;
  written: boolean;
};

export type LiveStepKind =
  | "thinking"
  | "sandbox"
  | "skill"
  | "read"
  | "install"
  | "file"
  | "delete"
  | "command"
  | "search"
  | "guard"
  | "compile"
  | "preview";

export type LiveStep = {
  id: string;
  kind: LiveStepKind;
  label: string;
  detail: string | null;
  path: string | null;
  status: "active" | "done" | "error";
};

export type LiveRun = {
  state: AgentState | null;
  message: string | null;
  reasoning: string;
  text: string;
  textTurn: number;
  tasks: TaskItem[];
  files: LiveFile[];
  tools: LiveTool[];
  sources: Source[];
  guard: Topics["guard"][];
  credits: number | null;
  previewUrl: string | null;
  steps: LiveStep[];
  events: number;
};

export const emptyLiveRun = (): LiveRun => ({
  state: null,
  message: null,
  reasoning: "",
  text: "",
  textTurn: -1,
  tasks: [],
  files: [],
  tools: [],
  sources: [],
  guard: [],
  credits: null,
  previewUrl: null,
  steps: [],
  events: 0,
});

export function isTerminal(event: LiveEvent) {
  return event.topic === "status" && terminalStates.includes(event.data.state);
}

export function lastTerminalIndex(events: readonly LiveEvent[]) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (isTerminal(events[index])) return index;
  }
  return -1;
}

const SETTLES = new Set<LiveStepKind>(["thinking", "compile"]);
const createVerbs = {
  created: ["Creating", "Created"],
  edited: ["Editing", "Edited"],
  deleted: ["Deleting", "Deleted"],
} as const;
const guardLabels: Record<string, string> = {
  review: "Safety check: tools restricted",
  block: "Safety check blocked a step",
  secret: "Removed a secret from the request",
};

function pushStep(run: LiveRun, step: Omit<LiveStep, "id">, id?: string) {
  run.steps = run.steps.map((entry) =>
    entry.status === "active" && SETTLES.has(entry.kind)
      ? { ...entry, status: "done" }
      : entry,
  );
  run.steps.push({ ...step, id: id ?? `step-${run.events}` });
}

function updateStep(
  run: LiveRun,
  find: (step: LiveStep) => boolean,
  patch: Partial<LiveStep>,
) {
  for (let index = run.steps.length - 1; index >= 0; index--) {
    if (find(run.steps[index])) {
      run.steps[index] = { ...run.steps[index], ...patch };
      return true;
    }
  }
  return false;
}

function recordStep(run: LiveRun, event: LiveEvent) {
  const last = run.steps.at(-1);
  switch (event.topic) {
    case "status": {
      const { state } = event.data;
      if (state === "thinking") {
        if (last?.kind === "thinking" && last.status === "active") return;
        pushStep(run, {
          kind: "thinking",
          label: "Thinking",
          detail: null,
          path: null,
          status: "active",
        });
      } else if (state === "compiling") {
        pushStep(run, {
          kind: "compile",
          label: "Compiling and saving the version",
          detail: null,
          path: null,
          status: "active",
        });
      } else if (state === "building") {
        updateStep(
          run,
          (step) => step.kind === "thinking" && step.status === "active",
          { status: "done", label: "Planned the next step" },
        );
      }
      return;
    }
    case "task": {
      const item = event.data;
      const done = { status: "done" as const, path: null };
      if (item.kind === "sandbox") {
        pushStep(run, {
          kind: "sandbox",
          label: item.label,
          detail: null,
          ...done,
        });
      } else if (item.kind === "skill") {
        pushStep(run, {
          kind: "skill",
          label: "Loaded skill",
          detail: item.name,
          ...done,
        });
      } else if (item.kind === "read") {
        pushStep(run, {
          kind: "read",
          label: "Read",
          detail: item.paths.join(", "),
          ...done,
          path: item.paths.length === 1 ? item.paths[0] : null,
        });
      } else if (item.kind === "install") {
        pushStep(run, {
          kind: "install",
          label: "Installed",
          detail: item.packages.join(" "),
          ...done,
        });
      } else if (item.verb === "deleted") {
        pushStep(run, {
          kind: "delete",
          label: "Deleted",
          detail: item.path,
          status: "done",
          path: item.path,
        });
      }
      return;
    }
    case "file": {
      const [active, finished] = createVerbs[event.data.verb];
      if (event.data.phase === "started") {
        pushStep(run, {
          kind: "file",
          label: active,
          detail: event.data.path,
          path: event.data.path,
          status: "active",
        });
        return;
      }
      const found = updateStep(
        run,
        (step) =>
          step.kind === "file" &&
          step.path === event.data.path &&
          step.status === "active",
        { status: "done", label: finished },
      );
      if (!found) {
        pushStep(run, {
          kind: "file",
          label: finished,
          detail: event.data.path,
          path: event.data.path,
          status: "done",
        });
      }
      return;
    }
    case "tool": {
      const id = `tool-${event.data.callId}`;
      if (event.data.phase === "call") {
        pushStep(
          run,
          {
            kind: "command",
            label: "Running",
            detail: event.data.command ?? event.data.name,
            path: null,
            status: "active",
          },
          id,
        );
      } else if (event.data.phase === "result") {
        const failed =
          event.data.exitCode !== null &&
          event.data.exitCode !== undefined &&
          event.data.exitCode !== 0;
        updateStep(run, (step) => step.id === id, {
          status: failed ? "error" : "done",
          label: failed ? "Command failed" : "Ran",
        });
      }
      return;
    }
    case "search":
      pushStep(run, {
        kind: "search",
        label: "Searched the web",
        detail: event.data.query,
        path: null,
        status: "done",
      });
      return;
    case "guard":
      pushStep(run, {
        kind: "guard",
        label: guardLabels[event.data.verdict] ?? "Safety check",
        detail: null,
        path: null,
        status: event.data.verdict === "review" ? "done" : "error",
      });
      return;
    case "preview":
      pushStep(run, {
        kind: "preview",
        label: "Preview is ready",
        detail: null,
        path: null,
        status: "done",
      });
      return;
  }
}

function applyEvent(run: LiveRun, event: LiveEvent) {
  run.events++;
  recordStep(run, event);
  switch (event.topic) {
    case "status":
      run.state = event.data.state;
      run.message = event.data.message ?? null;
      break;
    case "reasoning":
      run.reasoning += event.data.delta;
      break;
    case "text":
      if (event.data.turn !== run.textTurn) {
        run.textTurn = event.data.turn;
        run.text = "";
      }
      run.text += event.data.delta;
      break;
    case "task":
      run.tasks.push(event.data);
      break;
    case "file": {
      const file: LiveFile = {
        path: event.data.path,
        verb: event.data.verb,
        lines: event.data.lines ?? null,
        written: event.data.phase === "written",
      };
      run.files = [
        ...run.files.filter((entry) => entry.path !== file.path),
        file,
      ];
      break;
    }
    case "tool": {
      const index = run.tools.findIndex(
        (tool) => tool.callId === event.data.callId,
      );
      const current: LiveTool =
        index >= 0
          ? { ...run.tools[index] }
          : {
              callId: event.data.callId,
              name: event.data.name,
              command: null,
              output: "",
              exitCode: null,
              done: false,
            };
      if (event.data.command) current.command = event.data.command;
      if (event.data.chunk) current.output += event.data.chunk;
      if (event.data.phase === "result") {
        current.done = true;
        current.exitCode = event.data.exitCode ?? null;
      }
      if (index >= 0) run.tools[index] = current;
      else run.tools.push(current);
      break;
    }
    case "search":
      for (const source of event.data.sources) {
        if (!run.sources.some((entry) => entry.url === source.url)) {
          run.sources.push(source);
        }
      }
      break;
    case "guard":
      run.guard.push(event.data);
      break;
    case "credits":
      run.credits = event.data.used;
      break;
    case "preview":
      run.previewUrl = event.data.url;
      break;
  }
}

function copyRun(run: LiveRun): LiveRun {
  return {
    ...run,
    tasks: [...run.tasks],
    files: [...run.files],
    tools: [...run.tools],
    sources: [...run.sources],
    guard: [...run.guard],
    steps: [...run.steps],
  };
}

export function reduceLiveRun(
  events: readonly LiveEvent[],
  from: LiveRun = emptyLiveRun(),
): LiveRun {
  const run = copyRun(from);
  for (const event of events) applyEvent(run, event);
  return run;
}

export function splitLiveEvents(events: readonly LiveEvent[]) {
  const cut = lastTerminalIndex(events);
  return {
    finished: cut >= 0 ? events.slice(0, cut + 1) : [],
    current: events.slice(cut + 1),
  };
}

export type LiveTracker = {
  run: LiveRun;
  finished: number;
  lastPreview: string | null;
  processed: number;
};

export const emptyTracker = (): LiveTracker => ({
  run: emptyLiveRun(),
  finished: 0,
  lastPreview: null,
  processed: 0,
});

export function advanceLive(
  tracker: LiveTracker,
  events: readonly LiveEvent[],
): LiveTracker {
  if (events.length < tracker.processed)
    return advanceLive(emptyTracker(), events);
  if (events.length === tracker.processed) return tracker;
  let run = copyRun(tracker.run);
  let { finished, lastPreview } = tracker;
  for (const event of events.slice(tracker.processed)) {
    applyEvent(run, event);
    if (isTerminal(event)) {
      finished++;
      lastPreview = run.previewUrl ?? lastPreview;
      run = emptyLiveRun();
    }
  }
  return { run, finished, lastPreview, processed: events.length };
}

export function visibleLiveText(text: string) {
  const open = text.indexOf("<task_summary>");
  return stripSummaryTags(open === -1 ? text : text.slice(0, open));
}

export type ConsoleLine = {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: Date;
};

export function consoleLines(
  tools: readonly Pick<LiveTool, "command" | "output" | "exitCode" | "done">[],
  now: Date = new Date(),
): ConsoleLine[] {
  return tools.flatMap((tool) => {
    if (!tool.command) return [];
    const lines: ConsoleLine[] = [
      { level: "log", message: `$ ${tool.command}`, timestamp: now },
    ];
    for (const line of tool.output.split("\n")) {
      if (line.trim()) {
        lines.push({
          level: /\berror\b/i.test(line)
            ? "error"
            : /\bwarn(ing)?\b/i.test(line)
              ? "warn"
              : "log",
          message: line,
          timestamp: now,
        });
      }
    }
    if (tool.done && tool.exitCode !== null && tool.exitCode !== 0) {
      lines.push({
        level: "error",
        message: `exit code ${tool.exitCode}`,
        timestamp: now,
      });
    }
    return lines;
  });
}
