import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BotIcon } from "lucide-react";
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
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BotIcon />
            </EmptyMedia>
            <EmptyTitle>Waiting for the agent</EmptyTitle>
            <EmptyDescription>
              Your prompt is saved. The live preview and code appear here once
              the coding agent is connected.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/projects"
              className={buttonVariants({ variant: "outline" })}
            >
              Back to projects
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    </WorkspaceShell>
  );
}
