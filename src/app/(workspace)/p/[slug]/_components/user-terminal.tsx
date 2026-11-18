"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LockIcon, XIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalTitle,
} from "@/components/ai-elements/terminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalIcon } from "lucide-react";
import { useTRPC } from "@/trpc/client";

export const MAX_TERMINAL_CHARS = 200_000;
const MAX_HISTORY = 50;

export function UserTerminal({
  projectId,
  locked,
  onClose,
}: {
  projectId: string;
  locked: boolean;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [position, setPosition] = useState<number | null>(null);

  const append = (text: string) =>
    setOutput((previous) => (previous + text).slice(-MAX_TERMINAL_CHARS));

  const run = async (line: string) => {
    append(`$ ${line}\n`);
    setRunning(true);
    try {
      const response = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, command: line }),
      });
      if (!response.ok || !response.body) {
        append(
          `${(await response.text()).trim() || "The command didn't run."}\n`,
        );
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        append(decoder.decode(value, { stream: true }));
      }
    } catch {
      append(
        "Couldn't reach the terminal. Check your connection and try again.\n",
      );
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries(trpc.version.pathFilter());
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const line = command.trim();
    if (!line || running || locked) return;
    setHistory((previous) =>
      [...previous.filter((entry) => entry !== line), line].slice(-MAX_HISTORY),
    );
    setPosition(null);
    setCommand("");
    void run(line);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (history.length === 0) return;
    const next =
      event.key === "ArrowUp"
        ? Math.max(0, (position ?? history.length) - 1)
        : position === null
          ? null
          : position + 1 >= history.length
            ? null
            : position + 1;
    setPosition(next);
    setCommand(next === null ? "" : history[next]);
  };

  return (
    <Terminal
      output={output}
      isStreaming={running}
      onClear={() => setOutput("")}
      className="h-full rounded-none border-x-0 border-b-0"
      aria-label="Terminal"
    >
      <TerminalHeader>
        <TerminalTitle>
          <TerminalIcon className="size-4" />
          Terminal
        </TerminalTitle>
        <TerminalActions>
          <TerminalCopyButton aria-label="Copy the output" />
          <TerminalClearButton aria-label="Clear the output" />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Close the terminal"
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </TerminalActions>
      </TerminalHeader>
      <TerminalContent className="max-h-none min-h-0 flex-1 p-3 text-xs">
        {output ? undefined : (
          <p className="text-muted-foreground">
            Run commands in your project’s sandbox, like{" "}
            <code>npm install zod</code>. Changes show up as unsaved edits.
          </p>
        )}
      </TerminalContent>
      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t px-3 py-2"
      >
        <span aria-hidden className="font-mono text-sm text-muted-foreground">
          $
        </span>
        <Input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={locked || running}
          placeholder={
            locked
              ? "Locked while Vibe is building"
              : "Type a command and press Enter"
          }
          aria-label="Terminal command"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={2000}
          className="h-8 border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
        />
        {locked ? (
          <LockIcon aria-hidden className="size-4 text-muted-foreground" />
        ) : null}
      </form>
    </Terminal>
  );
}
