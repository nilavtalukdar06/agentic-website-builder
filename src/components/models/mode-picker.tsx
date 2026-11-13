"use client";

import { UsersIcon, ZapIcon, type LucideIcon } from "lucide-react";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import { SelectGroup } from "@/components/ui/select";
import { type AgentModeName, isAgentMode } from "@/lib/agent/modes";

export const agentModeOptions = [
  {
    value: "standard",
    label: "Standard",
    description: "A team of agents plans, builds and reviews",
    icon: UsersIcon,
  },
  {
    value: "fast",
    label: "Fast",
    description: "The builder alone, in fewer steps",
    icon: ZapIcon,
  },
] as const satisfies readonly {
  value: AgentModeName;
  label: string;
  description: string;
  icon: LucideIcon;
}[];

const items = agentModeOptions.map(({ value, label }) => ({ value, label }));

export function ModePicker({
  value,
  onChange,
  disabled,
}: {
  value: AgentModeName;
  onChange: (mode: AgentModeName) => void;
  disabled?: boolean;
}) {
  const selected =
    agentModeOptions.find((option) => option.value === value) ??
    agentModeOptions[0];

  return (
    <PromptInputSelect
      items={items}
      value={value}
      onValueChange={(next) => {
        if (isAgentMode(next)) onChange(next);
      }}
      disabled={disabled}
    >
      <PromptInputSelectTrigger
        size="sm"
        aria-label={`Mode: ${selected.label}. Change mode`}
      >
        <selected.icon aria-hidden />
        <PromptInputSelectValue />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent
        alignItemWithTrigger={false}
        align="start"
        className="w-auto min-w-(--anchor-width)"
      >
        <SelectGroup>
          {agentModeOptions.map((option) => (
            <PromptInputSelectItem key={option.value} value={option.value}>
              <option.icon aria-hidden className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </PromptInputSelectItem>
          ))}
        </SelectGroup>
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}
