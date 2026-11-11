"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  PaperclipIcon,
} from "lucide-react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
} from "@/components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ModelLogo } from "@/components/models/model-logo";
import { formatPrice, groupByProvider } from "@/lib/ai/models";
import { sampleAttachments, sampleModels } from "../_data/fixtures";

export function ModelAttachmentsExample() {
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState(sampleModels[0].id);
  const selected =
    sampleModels.find((model) => model.id === modelId) ?? sampleModels[0];

  return (
    <PromptInputProvider>
      <PromptInput onSubmit={() => {}}>
        <PromptInputHeader>
          {sampleAttachments.map((attachment) => (
            <PromptInputAttachment key={attachment.id} data={attachment} />
          ))}
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea placeholder="Match the layout of these screenshots…" />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton aria-label="Attach images">
              <PaperclipIcon />
            </PromptInputButton>
            <ModelSelector open={open} onOpenChange={setOpen}>
              <PromptInputButton
                aria-label={`Model: ${selected.name}. Change model`}
                onClick={() => setOpen(true)}
              >
                <ModelLogo modelId={selected.id} />
                {selected.name}
                <ChevronDownIcon />
              </PromptInputButton>
              <ModelSelectorContent title="Choose a model">
                <ModelSelectorInput placeholder="Search models…" />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                  {groupByProvider(sampleModels).map((group) => (
                    <ModelSelectorGroup key={group.label} heading={group.label}>
                      {group.items.map((model) => (
                        <ModelSelectorItem
                          key={model.id}
                          value={`${model.name} ${model.providerLabel}`}
                          onSelect={() => {
                            setModelId(model.id);
                            setOpen(false);
                          }}
                        >
                          <ModelLogo modelId={model.id} />
                          <ModelSelectorName>{model.name}</ModelSelectorName>
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            {model.vision ? (
                              <ImageIcon
                                aria-label="Reads images"
                                className="text-muted-foreground"
                              />
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums sm:min-w-44 sm:text-right">
                            {formatPrice(model.pricing)}
                          </span>
                          <CheckIcon
                            className={
                              model.id === modelId ? "opacity-100" : "opacity-0"
                            }
                          />
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputSpeechButton />
            <PromptInputSubmit />
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
    </PromptInputProvider>
  );
}
