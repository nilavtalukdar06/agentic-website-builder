"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/trpc/client";
import { CodeEditor } from "./code-editor";

export const AUTOSAVE_MS = 1000;

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; previewUpdated: boolean }
  | { kind: "error"; message: string; content: string };

export function EditableFile({
  projectId,
  path,
  serverValue,
  locked,
}: {
  projectId: string;
  path: string;
  serverValue: string;
  locked: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const write = useMutation(trpc.code.write.mutationOptions());
  const [value, setValue] = useState(serverValue);
  const [saved, setSaved] = useState(serverValue);
  const [seenServer, setSeenServer] = useState(serverValue);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  if (serverValue !== seenServer) {
    setSeenServer(serverValue);
    if (serverValue !== saved) {
      if (value !== saved) {
        setNotice(
          "This file changed while you were editing it, so your unsaved typing was replaced with the new version.",
        );
      }
      setValue(serverValue);
      setSaved(serverValue);
    }
  }

  const dirty = value !== saved;
  const saving = status.kind === "saving";
  const failedOn = status.kind === "error" ? status.content : null;

  const persist = async (content: string) => {
    setStatus({ kind: "saving" });
    try {
      const result = await write.mutateAsync({ projectId, path, content });
      setSaved(content);
      setStatus({ kind: "saved", previewUpdated: result.previewUpdated });
      void queryClient.invalidateQueries(trpc.version.pathFilter());
    } catch (error) {
      setStatus({
        kind: "error",
        content,
        message:
          error instanceof Error && error.message
            ? error.message
            : "Try again in a moment.",
      });
    }
  };

  useEffect(() => {
    if (!dirty || locked || saving || value === failedOn) return;
    const timer = setTimeout(() => void persist(value), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist only closes over the values listed here
  }, [value, dirty, locked, saving, failedOn]);

  const saveNow = () => {
    if (dirty && !locked && !saving) void persist(value);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveNow();
    }
  };

  return (
    <div
      className="relative h-full min-h-0"
      onKeyDown={onKeyDown}
      onBlur={saveNow}
    >
      <CodeEditor
        path={path}
        value={value}
        onChange={(next) => {
          setValue(next);
          setNotice(null);
        }}
        readOnly={locked}
        label={`Edit ${path}`}
      />
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute right-3 bottom-3 z-10 flex items-center gap-1.5 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur"
      >
        {locked ? (
          <>
            <LockIcon className="size-3" />
            Locked while Vibe builds
          </>
        ) : saving ? (
          <>
            <Spinner className="size-3" />
            Saving…
          </>
        ) : status.kind === "error" ? (
          <span className="pointer-events-auto flex items-center gap-1.5 text-destructive">
            <TriangleAlertIcon className="size-3" />
            <span className="max-w-64 truncate">
              Couldn’t save: {status.message}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => void persist(value)}
            >
              Retry
            </Button>
          </span>
        ) : dirty ? (
          <>Unsaved · saves as you type</>
        ) : status.kind === "saved" ? (
          <>
            <CheckIcon className="size-3" />
            {status.previewUpdated
              ? "Saved · preview updated"
              : "Saved · open the preview to see it"}
          </>
        ) : null}
      </div>
      {notice ? (
        <p
          role="alert"
          className="absolute inset-x-3 top-3 z-10 rounded-md border bg-warning/10 px-3 py-2 text-xs text-foreground"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
