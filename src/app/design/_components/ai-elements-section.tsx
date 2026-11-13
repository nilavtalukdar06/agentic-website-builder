"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CopyIcon,
  ExternalLinkIcon,
  ListIcon,
  MonitorIcon,
  PaperclipIcon,
  RotateCwIcon,
  SmartphoneIcon,
  TabletIcon,
  TerminalIcon,
} from "lucide-react";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
  FileTreeName,
} from "@/components/ai-elements/file-tree";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Snippet,
  SnippetCopyButton,
  SnippetInput,
  SnippetText,
} from "@/components/ai-elements/snippet";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { FileIcon } from "@/components/files/file-icon";
import { toast } from "@/components/ui/toast";
import {
  sampleAssistantIntro,
  sampleCode,
  sampleConsoleLogs,
  sampleFileTree,
  sampleFollowUps,
  samplePreviewUrl,
  samplePrompt,
  sampleReasoning,
  sampleSources,
  sampleSuggestions,
  sampleSummary,
  sampleTaskItems,
  sampleTerminalOutput,
  type SampleTreeNode,
} from "../_data/fixtures";
import { DesignSection, Example } from "./section";
import { ModelAttachmentsExample } from "./model-attachments-example";

function TreeNodes({ nodes }: { nodes: SampleTreeNode[] }) {
  return nodes.map((node) =>
    node.type === "folder" ? (
      <FileTreeFolder key={node.path} path={node.path} name={node.name}>
        <TreeNodes nodes={node.children} />
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={node.path} path={node.path} name={node.name}>
        <span className="size-4 shrink-0" />
        <FileTreeIcon>
          <FileIcon path={node.path} />
        </FileTreeIcon>
        <FileTreeName className="flex-1">{node.name}</FileTreeName>
        {node.marker ? (
          <span
            aria-label={node.marker === "A" ? "Added" : "Modified"}
            className={
              node.marker === "A"
                ? "font-mono text-xs text-success"
                : "font-mono text-xs text-warning"
            }
          >
            {node.marker}
          </span>
        ) : null}
      </FileTreeFile>
    ),
  );
}

export function AiElementsSection() {
  const [selectedPath, setSelectedPath] = useState("app/page.tsx");

  return (
    <DesignSection
      id="ai-elements"
      description="Vercel AI Elements (Base UI build) with static sample data."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Example title="Conversation · Message · Reasoning · Task">
          <Conversation className="h-130 rounded-lg border">
            <ConversationContent>
              <Message from="user">
                <MessageContent>{samplePrompt}</MessageContent>
              </Message>
              <Message from="assistant">
                <MessageContent>
                  <Reasoning duration={4} defaultOpen={false}>
                    <ReasoningTrigger />
                    <ReasoningContent>{sampleReasoning}</ReasoningContent>
                  </Reasoning>
                  <MessageResponse>{sampleAssistantIntro}</MessageResponse>
                  <Task>
                    <TaskTrigger title="Building Ember & Oak">
                      <div className="flex w-full cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                        <ListIcon className="size-4" />
                        <span>Building Ember &amp; Oak</span>
                      </div>
                    </TaskTrigger>
                    <TaskContent>
                      <TaskItem>
                        Created sandbox from{" "}
                        <TaskItemFile className="font-mono">
                          nextjs-16
                        </TaskItemFile>
                      </TaskItem>
                      {sampleTaskItems.map((item) => (
                        <TaskItem key={item.path}>
                          {item.verb}{" "}
                          <TaskItemFile className="font-mono">
                            <FileIcon path={item.path} />
                            {item.path}
                          </TaskItemFile>
                        </TaskItem>
                      ))}
                      <TaskItem className="flex items-center gap-1">
                        <Shimmer as="span">Creating</Shimmer>{" "}
                        <TaskItemFile className="font-mono">
                          <FileIcon path="components/footer.tsx" />
                          components/footer.tsx
                        </TaskItemFile>
                        <span className="font-mono text-xs text-success">
                          +83
                        </span>
                      </TaskItem>
                    </TaskContent>
                  </Task>
                </MessageContent>
              </Message>
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>{sampleSummary}</MessageResponse>
                </MessageContent>
                <MessageActions>
                  <MessageAction tooltip="Copy" label="Copy">
                    <CopyIcon className="size-4" />
                  </MessageAction>
                  <MessageAction tooltip="Retry" label="Retry">
                    <RotateCwIcon className="size-4" />
                  </MessageAction>
                </MessageActions>
              </Message>
              <Checkpoint>
                <CheckpointIcon>
                  <BookmarkIcon className="size-4 shrink-0" />
                </CheckpointIcon>
                <span className="shrink-0 text-xs">
                  Checkpoint v3 · 42 credits
                </span>
                <CheckpointTrigger tooltip="Restore this version">
                  Restore
                </CheckpointTrigger>
              </Checkpoint>
            </ConversationContent>
          </Conversation>
        </Example>

        <div className="flex flex-col gap-4">
          <Example title="Tool · Terminal">
            <Tool defaultOpen>
              <ToolHeader
                type="dynamic-tool"
                toolName="run_command"
                state="input-available"
              />
              <ToolContent>
                <Terminal output={sampleTerminalOutput} isStreaming />
              </ToolContent>
            </Tool>
          </Example>
          <Example title="PromptInput · Suggestion">
            <Suggestions>
              {sampleSuggestions.map((suggestion) => (
                <Suggestion key={suggestion} suggestion={suggestion} />
              ))}
            </Suggestions>
            <PromptInput
              onSubmit={(message) => {
                toast.add({
                  title: "Prompt submitted",
                  description: message.text || "Empty prompt",
                });
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea placeholder="Ask Vibe to build…" />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputButton aria-label="Attach files">
                    <PaperclipIcon className="size-4" />
                  </PromptInputButton>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">5,108</span> credits used
                  </span>
                </PromptInputTools>
                <PromptInputSubmit />
              </PromptInputFooter>
            </PromptInput>
            <div className="flex flex-wrap gap-2">
              {sampleFollowUps.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  className="rounded-lg"
                />
              ))}
            </div>
          </Example>
          <Example title="ModelSelector · Attachments · Voice input">
            <ModelAttachmentsExample />
          </Example>
          <Example title="Sources">
            <Sources defaultOpen>
              <SourcesTrigger count={sampleSources.length} />
              <SourcesContent>
                {sampleSources.map((source) => (
                  <Source
                    key={source.url}
                    href={source.url}
                    title={source.title}
                  />
                ))}
              </SourcesContent>
            </Sources>
          </Example>
          <Example title="Snippet · Shimmer">
            <Snippet code="npx create-next-app@latest ember-oak">
              <SnippetText>
                <TerminalIcon className="size-4" />
              </SnippetText>
              <SnippetInput aria-label="Command" />
              <SnippetCopyButton />
            </Snippet>
            <Shimmer>Compiling app/page.tsx…</Shimmer>
          </Example>
        </div>

        <Example title="WebPreview" className="lg:col-span-2">
          <WebPreview defaultUrl={samplePreviewUrl} className="h-96">
            <WebPreviewNavigation>
              <WebPreviewNavigationButton tooltip="Back" disabled>
                <ArrowLeftIcon className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip="Forward" disabled>
                <ArrowRightIcon className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip="Reload">
                <RotateCwIcon className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewUrl
                readOnly
                aria-label="Preview URL"
                className="font-mono"
              />
              <WebPreviewNavigationButton tooltip="Desktop">
                <MonitorIcon className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip="Tablet">
                <TabletIcon className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip="Mobile">
                <SmartphoneIcon className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip="Open in new tab">
                <ExternalLinkIcon className="size-4" />
              </WebPreviewNavigationButton>
            </WebPreviewNavigation>
            <WebPreviewBody src="about:blank" title="Sample preview" />
            <WebPreviewConsole logs={sampleConsoleLogs} />
          </WebPreview>
        </Example>

        <Example title="FileTree · CodeBlock" className="lg:col-span-2">
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <FileTree
              defaultExpanded={new Set(["app", "components", "lib"])}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            >
              <TreeNodes nodes={sampleFileTree} />
            </FileTree>
            <CodeBlock code={sampleCode} language="tsx" showLineNumbers>
              <CodeBlockCopyButton />
            </CodeBlock>
          </div>
        </Example>

        <Example title="Empty conversation">
          <Conversation className="h-48 rounded-lg border">
            <ConversationContent className="h-full">
              <ConversationEmptyState
                title="Nothing here yet"
                description="Describe a website and Vibe will start building."
              />
            </ConversationContent>
          </Conversation>
        </Example>

        <Example title="Empty file tree">
          <FileTree>
            <p className="px-2 py-6 text-center text-caption text-muted-foreground">
              No files yet. They appear as the agent writes them.
            </p>
          </FileTree>
        </Example>
      </div>
    </DesignSection>
  );
}
