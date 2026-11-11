"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  RotateCwIcon,
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
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentModel, formatPrice, groupByProvider } from "@/lib/ai/models";
import { useTRPC } from "@/trpc/client";
import { ModelLogo } from "./model-logo";

export function useAgentModels() {
  const trpc = useTRPC();
  return useQuery(trpc.model.list.queryOptions());
}

export function resolveSelectedModel(
  models: AgentModel[] | undefined,
  selectedId: string | null,
  defaultId: string | null | undefined,
) {
  if (!models?.length) return null;
  return (
    models.find((model) => model.id === selectedId) ??
    models.find((model) => model.id === defaultId) ??
    models[0]
  );
}

export function ModelPicker({
  value,
  onChange,
  needsVision,
  disabled,
}: {
  value: string | null;
  onChange: (id: string) => void;
  needsVision: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, refetch, isRefetching } = useAgentModels();

  if (isPending) {
    return (
      <PromptInputButton disabled aria-label="Loading models">
        <Skeleton className="h-3.5 w-24" />
      </PromptInputButton>
    );
  }

  if (isError) {
    return (
      <PromptInputButton
        tooltip="Couldn't load the models. Select to try again"
        onClick={() => void refetch()}
        disabled={isRefetching}
      >
        <RotateCwIcon />
        Models unavailable
      </PromptInputButton>
    );
  }

  const selected = resolveSelectedModel(
    data.models,
    value,
    data.defaultModelId,
  );

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <PromptInputButton
        aria-label={`Model: ${selected?.name ?? "none"}. Change model`}
        tooltip="Choose the model that builds your site"
        onClick={() => setOpen(true)}
        disabled={disabled || !selected}
      >
        {selected ? <ModelLogo provider={selected.provider} /> : null}
        <span className="max-w-36 truncate">
          {selected?.name ?? "No models"}
        </span>
        <ChevronDownIcon />
      </PromptInputButton>
      <ModelSelectorContent title="Choose a model">
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {groupByProvider(data.models).map((group) => (
            <ModelSelectorGroup key={group.label} heading={group.label}>
              {group.items.map((model) => {
                const blocked = needsVision && !model.vision;
                return (
                  <ModelSelectorItem
                    key={model.id}
                    value={`${model.name} ${model.providerLabel} ${model.id}`}
                    disabled={blocked}
                    onSelect={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                  >
                    <ModelLogo
                      provider={model.provider}
                      className="text-muted-foreground"
                    />
                    <ModelSelectorName>{model.name}</ModelSelectorName>
                    {blocked ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        No image input
                      </span>
                    ) : (
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        {model.vision ? (
                          <ImageIcon
                            aria-label="Reads images"
                            className="text-muted-foreground"
                          />
                        ) : null}
                      </span>
                    )}
                    {model.pricing ? (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums sm:min-w-44 sm:text-right">
                        {formatPrice(model.pricing)}
                      </span>
                    ) : null}
                    <CheckIcon
                      className={
                        model.id === selected?.id ? "opacity-100" : "opacity-0"
                      }
                    />
                  </ModelSelectorItem>
                );
              })}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
