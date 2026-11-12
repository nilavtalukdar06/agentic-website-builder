"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  ModelPicker,
  resolveSelectedModel,
  useAgentModels,
} from "@/components/models/model-picker";
import { PROMPT_INPUT_ID } from "@/components/shell/new-project-button";
import { toast } from "@/components/ui/toast";
import { useTypewriter } from "@/hooks/use-typewriter";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from "@/lib/attachments";
import { uploadAttachment } from "@/lib/upload-attachment";
import { useTRPC } from "@/trpc/client";

export const promptSuggestions = [
  {
    label: "SaaS landing page",
    prompt:
      "A SaaS landing page with a hero, feature grid, pricing table and FAQ.",
  },
  {
    label: "Developer portfolio",
    prompt:
      "A developer portfolio with an about section, project cards and a contact form.",
  },
  {
    label: "Restaurant menu",
    prompt:
      "A restaurant menu with categories, dietary tags and a table booking form.",
  },
  {
    label: "Admin dashboard",
    prompt:
      "An admin dashboard with a sidebar, stat cards, a chart and a data table.",
  },
  {
    label: "Event page",
    prompt:
      "An event page with a schedule, speakers, tracks and a registration CTA.",
  },
] as const;

export const promptPlaceholders = [
  "Ask Vibe to build a landing page for my coffee roastery…",
  "Ask Vibe for a developer portfolio with project cards…",
  "Ask Vibe for a restaurant menu with table booking…",
  "Ask Vibe for an admin dashboard with charts…",
] as const;

const attachErrors = {
  accept: "Only PNG, JPEG, WebP and GIF images can be attached.",
  max_file_size: "Images must be 4 MB or smaller.",
  max_files: `You can attach up to ${MAX_ATTACHMENTS} images.`,
} as const;

function PromptComposer() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { textInput, attachments } = usePromptInputController();
  const [modelId, setModelId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const models = useAgentModels();
  const placeholder = useTypewriter(promptPlaceholders);
  const selectedModel = resolveSelectedModel(
    models.data?.models,
    modelId,
    models.data?.defaultModelId,
  );
  const hasImages = attachments.files.length > 0;

  const create = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: (project) => {
        router.push(`/p/${project.slug}`);
        void queryClient.invalidateQueries(trpc.project.pathFilter());
      },
      onError: (error) => {
        toast.add({
          type: "error",
          title: "Couldn't create the project",
          description: error.message || "Try again in a moment.",
        });
      },
    }),
  );

  const { setInput } = textInput;

  useEffect(() => {
    const element = document.getElementById(PROMPT_INPUT_ID);
    if (element instanceof HTMLTextAreaElement && element.value) {
      setInput(element.value);
    }
  }, [setInput]);

  const empty = textInput.value.trim().length === 0;
  const busy = uploading || create.isPending;

  const applySuggestion = (prompt: string) => {
    textInput.setInput(prompt);
    document.getElementById(PROMPT_INPUT_ID)?.focus();
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <PromptInput
        className="w-full"
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
          if (!prompt || busy) return;
          if (files.length > 0 && selectedModel && !selectedModel.vision) {
            toast.add({
              type: "error",
              title: `${selectedModel.name} can't read images`,
              description:
                "Pick a model that supports images, or remove the images.",
            });
            throw new Error("Model can't read images");
          }
          let attachmentIds: string[] = [];
          if (files.length > 0) {
            setUploading(true);
            try {
              const uploaded = await Promise.all(
                files.map((file) => uploadAttachment(file)),
              );
              attachmentIds = uploaded.map((attachment) => attachment.id);
            } catch (error) {
              toast.add({
                type: "error",
                title: "Couldn't upload the images",
                description:
                  error instanceof Error ? error.message : "Try again.",
              });
              throw error;
            } finally {
              setUploading(false);
            }
          }
          await create.mutateAsync({
            prompt,
            model: selectedModel?.id,
            attachmentIds,
          });
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
            id={PROMPT_INPUT_ID}
            aria-label="Describe the website to build"
            placeholder={placeholder.text}
            className="min-h-24"
            maxLength={4000}
            autoFocus
            disabled={busy}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              aria-label="Attach images"
              tooltip="Attach reference images (PNG, JPEG, WebP or GIF, up to 4 MB)"
              onClick={() => attachments.openFileDialog()}
              disabled={busy || attachments.files.length >= MAX_ATTACHMENTS}
            >
              <PaperclipIcon />
            </PromptInputButton>
            <ModelPicker
              value={modelId}
              onChange={setModelId}
              needsVision={hasImages}
              disabled={busy}
            />
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputSpeechButton
              disabled={busy}
              onSpeechError={(message) =>
                toast.add({
                  type: "error",
                  title: "Voice input",
                  description: message,
                })
              }
            />
            <PromptInputSubmit
              aria-label="Create project"
              status={busy ? "submitted" : undefined}
              disabled={empty || busy}
            >
              {busy ? undefined : <ArrowUpIcon />}
            </PromptInputSubmit>
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
      <Suggestions>
        {promptSuggestions.map((suggestion) => (
          <Suggestion
            key={suggestion.label}
            suggestion={suggestion.prompt}
            onClick={applySuggestion}
            disabled={busy}
            className="bg-background/70 backdrop-blur-md"
          >
            {suggestion.label}
          </Suggestion>
        ))}
      </Suggestions>
    </div>
  );
}

export function NewProjectPrompt() {
  return (
    <PromptInputProvider>
      <PromptComposer />
    </PromptInputProvider>
  );
}
