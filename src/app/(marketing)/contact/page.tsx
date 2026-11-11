import { ArrowUpRightIcon, MailIcon } from "lucide-react";
import type { Metadata } from "next";
import { GithubIcon } from "@/components/icons/github-icon";
import { InstagramIcon } from "@/components/icons/instagram-icon";
import { LinkedinIcon } from "@/components/icons/linkedin-icon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ContactChannelId, contactChannels } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch about Vibe: email, Instagram, LinkedIn and GitHub.",
  alternates: { canonical: "/contact" },
};

const icons: Record<
  ContactChannelId,
  React.ComponentType<React.ComponentProps<"svg">>
> = {
  email: MailIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  github: GithubIcon,
};

export default function ContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title">Contact</h1>
        <p className="text-body text-muted-foreground">
          Questions, bugs or feedback? Pick whichever channel suits you.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {contactChannels.map((channel) => {
          const Icon = icons[channel.id];
          const external = channel.href.startsWith("http");
          return (
            <li key={channel.id}>
              <a
                href={channel.href}
                aria-label={`${channel.label}: ${channel.handle}`}
                className="group/contact block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                <Card className="h-full gap-3 transition-colors group-hover/contact:border-input group-hover/contact:bg-accent/40">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground">
                        <Icon className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <CardTitle>{channel.label}</CardTitle>
                        <CardDescription className="truncate font-mono text-xs">
                          {channel.handle}
                        </CardDescription>
                      </div>
                      <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/contact:translate-x-0.5 group-hover/contact:-translate-y-0.5" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-caption text-muted-foreground">
                      {channel.description}
                    </p>
                  </CardContent>
                </Card>
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
