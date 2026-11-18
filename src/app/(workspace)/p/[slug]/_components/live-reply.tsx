"use client";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  type AgentState,
  type LiveRun,
  visibleLiveText,
} from "@/lib/agent/live-run";
import {
  BuildTask,
  CommandTool,
  RestrictedNotice,
  SourceList,
} from "./agent-parts";

const stateLabels: Partial<Record<AgentState, string>> = {
  thinking: "Thinking…",
  building: "Building…",
  compiling: "Compiling and saving the version…",
};

export function LiveReply({
  live,
  projectName,
  stopping = false,
}: {
  live: LiveRun;
  projectName: string;
  stopping?: boolean;
}) {
  const active = live.files.findLast((file) => !file.written) ?? null;
  const restricted = live.guard.some(
    (event) => event.stage === "input" && event.verdict === "review",
  );
  const text = visibleLiveText(live.text);
  const label = stopping
    ? "Stopping…"
    : ((live.state && stateLabels[live.state]) ?? "Starting…");
  const reasoningStreaming =
    !stopping && live.state === "thinking" && live.text.length === 0 && !active;

  return (
    <Message from="assistant" aria-busy="true">
      <MessageContent>
        {live.reasoning ? (
          <Reasoning isStreaming={reasoningStreaming} defaultOpen={false}>
            <ReasoningTrigger />
            <ReasoningContent>{live.reasoning}</ReasoningContent>
          </Reasoning>
        ) : null}
        {text ? <MessageResponse>{text}</MessageResponse> : null}
        <BuildTask
          title={`Building ${projectName}`}
          items={live.tasks}
          active={active}
        />
        {live.tools.map((tool) => (
          <CommandTool
            key={tool.callId}
            name={tool.name}
            command={tool.command}
            output={tool.output}
            exitCode={tool.exitCode}
            running={!tool.done}
          />
        ))}
        <SourceList sources={live.sources} />
        {restricted ? <RestrictedNotice /> : null}
        <Shimmer as="p" className="text-sm">
          {label}
        </Shimmer>
      </MessageContent>
    </Message>
  );
}
