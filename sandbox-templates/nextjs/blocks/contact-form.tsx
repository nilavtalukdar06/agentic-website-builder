"use client";

import { useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ContactFormProps = {
  id?: string;
  title: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string;
  className?: string;
};

export function ContactForm({
  id,
  title,
  description,
  submitLabel = "Send message",
  successMessage = "Thanks! We'll get back to you within one business day.",
  className,
}: ContactFormProps) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  return (
    <section
      id={id}
      className={cn("mx-auto max-w-xl px-4 py-20 sm:px-6", className)}
    >
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {sent ? (
        <div
          role="status"
          className="mt-10 flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center"
        >
          <CheckCircle2Icon className="size-8 text-primary" aria-hidden />
          <p className="font-medium">{successMessage}</p>
        </div>
      ) : (
        <form
          className="mt-10 flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            setSending(true);
            setTimeout(() => {
              setSending(false);
              setSent(true);
            }, 600);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                name="name"
                required
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea id="contact-message" name="message" rows={5} required />
          </div>
          <Button type="submit" disabled={sending}>
            {sending ? "Sending…" : submitLabel}
          </Button>
        </form>
      )}
    </section>
  );
}
