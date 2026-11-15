"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export type DeleteProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
  blockedReason?: string | null;
};

function DeleteProjectForm({
  projectName,
  onConfirm,
  onCancel,
  pending,
  error,
  blockedReason,
}: Omit<DeleteProjectDialogProps, "open" | "onOpenChange"> & {
  onCancel: () => void;
}) {
  const id = useId();
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation === projectName;
  const disabled = !matches || pending || !!blockedReason;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onConfirm();
      }}
      className="contents"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>
            <span>
              Type{" "}
              <strong className="font-semibold wrap-anywhere">
                {projectName}
              </strong>{" "}
              to confirm
            </span>
          </FieldLabel>
          <Input
            id={id}
            value={confirmation}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={pending}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <FieldDescription id={`${id}-hint`}>
            The name must match exactly, including capitals.
          </FieldDescription>
        </Field>
        {blockedReason ? (
          <p role="status" className="text-sm text-muted-foreground">
            {blockedReason}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={disabled}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Deleting…" : "Delete project"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  ...form
}: DeleteProjectDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && form.pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!form.pending}>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            This permanently deletes{" "}
            <span className="font-medium wrap-anywhere text-foreground">
              {form.projectName}
            </span>
            : its chat history, saved versions, attached images and preview
            sandbox. Credits already spent aren&apos;t refunded, and a GitHub
            repository you exported to stays on GitHub. This can&apos;t be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DeleteProjectForm {...form} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
