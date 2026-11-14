"use client";

import { useState } from "react";
import { ArrowRightIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import {
  ModelPicker,
  resolveSelectedModel,
  useAgentModels,
} from "@/components/models/model-picker";
import { toast } from "@/components/ui/toast";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from "@/lib/attachments";
import { uploadAttachment } from "@/lib/upload-attachment";

export const followUpSuggestions = [
  "Make it fully responsive",
  "Add a contact form",
  "Refine the color palette",
] as const;

export const CHAT_INPUT_ID = "workspace-prompt";

const attachErrors = {
  accept: "Only PNG, JPEG, WebP and GIF images can be attached.",
  max_file_size: "Images must be 4 MB or smaller.",
  max_files: `You can attach up to ${MAX_ATTACHMENTS} images.`,
} as const;

export type SendInput = {
  prompt: string;
  model?: string;
  attachmentIds: string[];
};

type ComposerProps = {
  building: boolean;
  blocked?: boolean;
  stopping: boolean;
  creditsUsed: number | null;
  initialModel: string | null;
  onSend: (input: SendInput) => Promise<unknown>;
  onStop: () => void;
};

function Composer({
  building,
  blocked = false,
  stopping,
  creditsUsed,
  initialModel,
  onSend,
  onStop,
}: ComposerProps) {
  const { textInput, attachments } = usePromptInputController();
  const [modelId, setModelId] = useState<string | null>(initialModel);
  const [sending, setSending] = useState(false);
  const models = useAgentModels();
  const selectedModel = resolveSelectedModel(
    models.data?.models,
    modelId,
    models.data?.defaultModelId,
  );
  const hasImages = attachments.files.length > 0;
  const empty = textInput.value.trim().length === 0;

  const applySuggestion = (text: string) => {
    textInput.setInput(text);
    document.getElementById(CHAT_INPUT_ID)?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      {!building ? (
        <div className="flex flex-wrap gap-2">
          {followUpSuggestions.map((suggestion) => (
            <Suggestion
              key={suggestion}
              suggestion={suggestion}
              onClick={applySuggestion}
              disabled={sending || blocked}
              variant="accent"
              size="chip"
              className="px-2.5"
            >
              <ArrowRightIcon data-icon="inline-start" />
              {suggestion}
            </Suggestion>
          ))}
        </div>
      ) : null}
      <PromptInput
        className="*:data-[slot=input-group]:rounded-[1.25rem] *:data-[slot=input-group]:bg-composer! *:data-[slot=input-group]:ring-0! *:data-[slot=input-group]:has-[[data-slot=input-group-control]:focus-visible]:border-input! *:data-[slot=input-group]:has-[[data-slot=input-group-control]:focus-visible]:ring-0!"
        accept={ATTACHMENT_ACCEPT}
        multiple
        maxFiles={MAX_ATTACHMENTS}
        maxFileSize={MAX_ATTACHMENT_BYTES}
        onError={({ code }) =>
          toast.add({
            type: "error",
            title: "Couldn't attach the image",
            description: attachErrors[code],
          })
        }
        onSubmit={async ({ text, files }) => {
          const prompt = text.trim();
          if (!prompt || sending || blocked) return;
          if (files.length > 0 && selectedModel && !selectedModel.vision) {
            toast.add({
              type: "error",
              title: `${selectedModel.name} can't read images`,
              description:
                "Pick a model that supports images, or remove the images.",
            });
            throw new Error("Model can't read images");
          }
          setSending(true);
          try {
            const uploaded = await Promise.all(
              files.map((file) => uploadAttachment(file)),
            );
            await onSend({
              prompt,
              model: selectedModel?.id,
              attachmentIds: uploaded.map((attachment) => attachment.id),
            });
          } catch (error) {
            toast.add({
              type: "error",
              title: "Couldn't send the message",
              description:
                error instanceof Error ? error.message : "Try again.",
            });
            throw error;
          } finally {
            setSending(false);
          }
        }}
      >
        {hasImages ? (
          <PromptInputHeader>
            <PromptInputAttachments className="p-0">
              {(file) => <PromptInputAttachment data={file} />}
            </PromptInputAttachments>
          </PromptInputHeader>
        ) : null}
        <PromptInputBody>
          <PromptInputTextarea
            id={CHAT_INPUT_ID}
            aria-label="Message Vibe"
            placeholder={
              building
                ? "Queue a follow-up while Vibe works…"
                : "Ask Vibe to change something…"
            }
            maxLength={4000}
            className="min-h-14"
            disabled={sending || blocked}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              aria-label="Attach images"
              tooltip="Attach reference images (PNG, JPEG, WebP or GIF, up to 4 MB)"
              onClick={() => attachments.openFileDialog()}
              disabled={sending || attachments.files.length >= MAX_ATTACHMENTS}
              variant="outline"
              className="rounded-full"
            >
              <PlusIcon />
            </PromptInputButton>
            {building ? (
              <span className="text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {(creditsUsed ?? 0).toLocaleString()}
                </span>{" "}
                credits used
              </span>
            ) : (
              <ModelPicker
                value={modelId}
                onChange={setModelId}
                needsVision={hasImages}
                disabled={sending || blocked}
              />
            )}
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputSpeechButton
              disabled={sending || blocked}
              onSpeechError={(message) =>
                toast.add({
                  type: "error",
                  title: "Voice input",
                  description: message,
                })
              }
            />
            {building && empty ? (
              <PromptInputSubmit
                className="rounded-full"
                aria-label={stopping ? "Stopping" : "Stop"}
                status={stopping ? "submitted" : "streaming"}
                onStop={onStop}
                disabled={stopping}
              />
            ) : (
              <PromptInputSubmit
                className="rounded-full"
                aria-label={building ? "Queue message" : "Send message"}
                status={sending ? "submitted" : undefined}
                disabled={empty || sending || blocked}
              >
                {sending ? undefined : <ArrowUpIcon />}
              </PromptInputSubmit>
            )}
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export function ChatComposer(props: ComposerProps) {
  return (
    <PromptInputProvider>
      <Composer {...props} />
    </PromptInputProvider>
  );
}
