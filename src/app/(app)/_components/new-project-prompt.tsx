"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  GlobeIcon,
  MicIcon,
  PaperclipIcon,
} from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { PROMPT_INPUT_ID } from "@/components/shell/new-project-button";
import { toast } from "@/components/ui/toast";
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

const soon = "Coming soon";

function PromptComposer() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { textInput } = usePromptInputController();

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

  const applySuggestion = (prompt: string) => {
    textInput.setInput(prompt);
    document.getElementById(PROMPT_INPUT_ID)?.focus();
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <PromptInput
        className="w-full"
        onSubmit={async ({ text }) => {
          const prompt = text.trim();
          if (!prompt || create.isPending) return;
          await create.mutateAsync({ prompt });
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            id={PROMPT_INPUT_ID}
            aria-label="Describe the website to build"
            placeholder="A landing page for my coffee roastery with a shop section…"
            className="min-h-24"
            maxLength={4000}
            autoFocus
            disabled={create.isPending}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              aria-label="Attach files"
              tooltip={soon}
              disabled
            >
              <PaperclipIcon />
            </PromptInputButton>
            <PromptInputButton tooltip={soon} disabled>
              <GlobeIcon />
              Public
              <ChevronDownIcon />
            </PromptInputButton>
            <PromptInputButton
              tooltip="The sandbox runs Next.js. More frameworks soon"
              disabled
            >
              Next.js
              <ChevronDownIcon />
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputButton aria-label="Dictate" tooltip={soon} disabled>
              <MicIcon />
            </PromptInputButton>
            <PromptInputSubmit
              aria-label="Create project"
              status={create.isPending ? "submitted" : undefined}
              disabled={empty || create.isPending}
            >
              {create.isPending ? undefined : <ArrowUpIcon />}
            </PromptInputSubmit>
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
      <Suggestions className="w-auto max-w-full">
        {promptSuggestions.map((suggestion) => (
          <Suggestion
            key={suggestion.label}
            suggestion={suggestion.prompt}
            onClick={applySuggestion}
            disabled={create.isPending}
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
