"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { toast } from "@/components/ui/toast";
import type { LiveRun } from "@/lib/agent/live-run";
import { useTRPC } from "@/trpc/client";
import { ChatComposer, type SendInput } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { LiveReply } from "./live-reply";
import { useRestoreVersion } from "./use-restore-version";

export function ChatPanel({
  projectId,
  projectName,
  building,
  live,
  onViewCode,
}: {
  projectId: string;
  projectName: string;
  building: boolean;
  live: LiveRun;
  onViewCode?: (number: number) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({
    ...trpc.message.list.queryOptions({ projectId }),
    refetchInterval: building ? 5000 : false,
  });
  const { messages, latestVersion } = data;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.message.pathFilter()),
      queryClient.invalidateQueries(trpc.project.pathFilter()),
      queryClient.invalidateQueries(trpc.version.pathFilter()),
    ]);
  const fail = (title: string) => (error: { message: string }) =>
    toast.add({
      type: "error",
      title,
      description: error.message || "Try again in a moment.",
    });

  const send = useMutation(
    trpc.message.send.mutationOptions({ onSuccess: refresh }),
  );
  const stop = useMutation(
    trpc.message.stop.mutationOptions({
      onSuccess: refresh,
      onError: fail("Couldn't stop the agent"),
    }),
  );
  const retry = useMutation(
    trpc.message.retry.mutationOptions({
      onSuccess: refresh,
      onError: fail("Couldn't retry"),
    }),
  );
  const restore = useRestoreVersion();

  const pending = messages.filter((message) => message.pending);
  const stopping = pending.some((message) => message.stopping);
  const running = pending[0]?.id ?? null;
  const lastReply = messages.findLast(
    (message) => message.role === "ASSISTANT",
  );
  const busy = building || restore.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-6 px-3 pt-2 pb-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Nothing here yet"
              description="Describe a website and Vibe will start building."
            />
          ) : null}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              status={
                message.stopping
                  ? "stopping"
                  : message.pending && message.id !== running
                    ? "queued"
                    : null
              }
              canRetry={!busy && message.id === lastReply?.id}
              canRestore={!busy}
              onRetry={() => retry.mutate({ messageId: message.id })}
              isLatestVersion={message.version?.number === latestVersion}
              onRestore={(number) => restore.mutate({ projectId, number })}
              onViewCode={onViewCode}
            />
          ))}
          {building ? (
            <LiveReply live={live} projectName={projectName} />
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="p-2 pt-0">
        <ChatComposer
          building={building}
          stopping={stopping || stop.isPending}
          creditsUsed={live.credits}
          initialModel={
            messages.findLast((message) => message.role === "USER")?.model ??
            null
          }
          onSend={(input: SendInput) =>
            send.mutateAsync({ projectId, ...input })
          }
          onStop={() => stop.mutate({ projectId })}
        />
      </div>
    </div>
  );
}
