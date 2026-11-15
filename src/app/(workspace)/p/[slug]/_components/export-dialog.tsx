"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GithubIcon } from "@/components/icons/github-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/lib/auth-client";
import {
  exportLabels,
  exportProgress,
  repositoryName,
} from "@/lib/github-export";
import type { GithubExportState } from "./use-github-export";

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  slug,
  building,
  oauthError,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  slug: string;
  building: boolean;
  oauthError: boolean;
  state: GithubExportState;
}) {
  const id = useId();
  const { status, active, start, retry, pending } = state;
  const data = status.data;
  const job = data?.job;
  const [name, setName] = useState(slug);
  const [privateRepo, setPrivateRepo] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const permission = data?.permissions[privateRepo ? "private" : "public"];
  const retryPermission =
    job && data?.permissions[job.private ? "private" : "public"];
  async function connect(requiredPrivate: boolean) {
    setConnecting(true);
    setConnectionError(null);
    try {
      const result = await authClient.linkSocial({
        provider: "github",
        scopes: [requiredPrivate ? "repo" : "public_repo"],
        callbackURL: `/p/${slug}?export=true`,
        errorCallbackURL: `/p/${slug}?export=true&exportError=true`,
      });
      if (result.error) throw new Error();
    } catch {
      setConnectionError(
        "Could not connect GitHub. Try again; if your session is old, sign in again first.",
      );
      setConnecting(false);
    }
  }
  const blocked = building || !!data?.busy || pending || connecting;
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  const wasActive = useRef(false);
  const jobStatus = job?.status;
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current && jobStatus === "SUCCEEDED") {
      wasActive.current = false;
      const timer = setTimeout(() => onOpenChangeRef.current(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [active, jobStatus]);
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to GitHub</DialogTitle>
          <DialogDescription>
            Save your latest complete version to a public or private repository.
          </DialogDescription>
        </DialogHeader>
        {status.isPending ? (
          <div aria-label="Loading export options" className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : status.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn’t load export options</AlertTitle>
            <AlertDescription>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void status.refetch()}
              >
                Retry loading
              </Button>
            </AlertDescription>
          </Alert>
        ) : !data?.hasVersion ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No complete version yet</EmptyTitle>
              <EmptyDescription>
                Build a working version before exporting to GitHub.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {oauthError || connectionError ? (
              <Alert variant="destructive">
                <AlertTitle>GitHub connection wasn’t completed</AlertTitle>
                <AlertDescription>
                  {connectionError ??
                    "Try connecting again and allow repository access."}
                </AlertDescription>
              </Alert>
            ) : null}
            {active && job ? (
              <div role="status" className="space-y-3">
                <Progress value={exportProgress[job.status]}>
                  <ProgressLabel>{exportLabels[job.status]}</ProgressLabel>
                  <ProgressValue />
                </Progress>
                <p className="text-sm text-muted-foreground">
                  Exporting version {job.versionNumber}. You can close this
                  dialog and return later.
                </p>
              </div>
            ) : (
              <>
                {job?.status === "SUCCEEDED" ? (
                  <Alert>
                    <AlertTitle>Pushed to GitHub</AlertTitle>
                    <AlertDescription>
                      <a
                        href={
                          job.repositoryUrl ??
                          `https://github.com/${data.githubRepo}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {job.repository}
                      </a>
                      {job.commitSha ? (
                        <p>Commit {job.commitSha.slice(0, 7)}</p>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {job?.status === "FAILED" ? (
                  <Alert variant="destructive">
                    <AlertTitle>Export failed</AlertTitle>
                    <AlertDescription>
                      <p>{job.error ?? "Please try again."}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={blocked}
                        onClick={() =>
                          retryPermission
                            ? retry.mutate({ projectId, exportId: job.id })
                            : void connect(job.private)
                        }
                      >
                        {retryPermission
                          ? "Retry export"
                          : "Connect GitHub to retry"}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const parsed = repositoryName.safeParse(
                      data.githubRepo?.split("/")[1] ?? name,
                    );
                    if (!parsed.success) {
                      setValidation(
                        parsed.error.issues[0]?.message ??
                          "Choose a repository name.",
                      );
                      return;
                    }
                    setValidation(null);
                    if (!permission) {
                      void connect(privateRepo);
                      return;
                    }
                    start.mutate({
                      projectId,
                      name: parsed.data,
                      private: privateRepo,
                    });
                  }}
                >
                  <FieldGroup>
                    <Field data-invalid={!!validation}>
                      <FieldLabel htmlFor={id}>Repository name</FieldLabel>
                      <Input
                        id={id}
                        value={data.githubRepo?.split("/")[1] ?? name}
                        disabled={!!data.githubRepo || blocked}
                        aria-invalid={!!validation}
                        aria-describedby={
                          validation ? `${id}-error` : undefined
                        }
                        maxLength={100}
                        onChange={(event) => setName(event.target.value)}
                      />
                      <FieldError id={`${id}-error`}>{validation}</FieldError>
                      {data.githubRepo ? (
                        <FieldDescription>
                          New commits go to {data.githubRepo}. Choose the
                          repository’s current visibility below.
                        </FieldDescription>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldTitle id={`${id}-visibility`}>
                        Visibility
                      </FieldTitle>
                      <ToggleGroup
                        aria-labelledby={`${id}-visibility`}
                        value={[privateRepo ? "private" : "public"]}
                        onValueChange={(value) => {
                          if (value[0]) setPrivateRepo(value[0] === "private");
                        }}
                        variant="outline"
                        disabled={blocked}
                      >
                        <ToggleGroupItem value="private">
                          Private
                        </ToggleGroupItem>
                        <ToggleGroupItem value="public">Public</ToggleGroupItem>
                      </ToggleGroup>
                      <FieldDescription>
                        {privateRepo
                          ? "Only people with access to your repository can see its code."
                          : "Anyone can see this repository and its code."}
                      </FieldDescription>
                    </Field>
                    {!permission ? (
                      <p className="text-sm text-muted-foreground">
                        GitHub will ask for{" "}
                        {privateRepo ? "public and private" : "public"}{" "}
                        repository access. After connecting, review your options
                        and start the export.
                      </p>
                    ) : null}
                    {start.error || retry.error ? (
                      <FieldError>
                        {start.error?.message ?? retry.error?.message}
                      </FieldError>
                    ) : null}
                    {building || data.busy ? (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        Wait for the current project operation to finish.
                      </p>
                    ) : null}
                    <Button type="submit" variant="accent" disabled={blocked}>
                      <GithubIcon data-icon="inline-start" />
                      {connecting
                        ? "Connecting…"
                        : pending
                          ? "Starting export…"
                          : !permission
                            ? "Connect GitHub"
                            : data.githubRepo
                              ? "Push latest version"
                              : "Create repository and export"}
                    </Button>
                  </FieldGroup>
                </form>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
