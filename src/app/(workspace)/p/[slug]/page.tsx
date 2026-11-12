import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  BotIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MessageCircleQuestionMarkIcon,
  RefreshCwIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireSession } from "@/server/session";
import { getQueryClient, trpc } from "@/trpc/server";
import { WorkspaceShell } from "./_components/workspace-shell";

type Params = Promise<{ slug: string }>;

const getProject = cache(async (slug: string) => {
  await requireSession();
  try {
    return await getQueryClient().fetchQuery(
      trpc.project.bySlug.queryOptions({ slug }),
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const project = await getProject((await params).slug);
  return { title: project.name, robots: { index: false, follow: false } };
}

type Project = Awaited<ReturnType<typeof getProject>>;

const backLink = (
  <Link href="/projects" className={buttonVariants({ variant: "outline" })}>
    Back to projects
  </Link>
);

function AgentState({ project }: { project: Project }) {
  const { agent, previewUrl } = project;

  if (agent.status === "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Built by the agent</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm whitespace-pre-wrap">{agent.reply}</p>
          <div className="flex flex-wrap gap-2">
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants()}
              >
                <ExternalLinkIcon />
                Open preview
              </a>
            ) : null}
            {backLink}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (agent.status === "paused") {
    return (
      <Empty className="border" data-testid="agent-paused">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {agent.question.kind === "secret" ? (
              <KeyRoundIcon />
            ) : (
              <MessageCircleQuestionMarkIcon />
            )}
          </EmptyMedia>
          <EmptyTitle>Waiting for your answer</EmptyTitle>
          <EmptyDescription>
            The agent paused to ask: {agent.question.question}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Link
            href={`/p/${project.slug}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <RefreshCwIcon />
            Refresh
          </Link>
          {backLink}
        </EmptyContent>
      </Empty>
    );
  }

  const failed = agent.status === "failed";
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {failed ? <CircleAlertIcon /> : <BotIcon />}
        </EmptyMedia>
        <EmptyTitle>
          {failed ? "The agent stopped" : "The agent is building your site"}
        </EmptyTitle>
        <EmptyDescription>
          {failed
            ? agent.reply
            : "It is writing the code in a cloud sandbox. Refresh this page to see when it is done."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {failed ? null : (
          <Link
            href={`/p/${project.slug}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <RefreshCwIcon />
            Refresh
          </Link>
        )}
        {backLink}
      </EmptyContent>
    </Empty>
  );
}

export default async function ProjectPage({ params }: { params: Params }) {
  const project = await getProject((await params).slug);

  return (
    <WorkspaceShell title={project.name}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{project.name}</CardTitle>
            <CardDescription className="font-mono text-xs">
              {project.slug}
            </CardDescription>
          </CardHeader>
          {project.prompt ? (
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {project.prompt}
              </p>
            </CardContent>
          ) : null}
        </Card>
        <AgentState project={project} />
      </div>
    </WorkspaceShell>
  );
}
