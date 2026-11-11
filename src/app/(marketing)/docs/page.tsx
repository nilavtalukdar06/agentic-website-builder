import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { docArticles } from "./_content/articles";

export const metadata: Metadata = {
  title: "Docs",
  description: "Learn how to build, manage and export websites with Vibe.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title">Docs</h1>
        <p className="text-body text-muted-foreground">
          Everything you need to go from a prompt to a website. Vibe is in
          active development, and pages say when a feature isn&apos;t available
          yet.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {docArticles.map(({ slug, title, description, icon: Icon }) => (
          <li key={slug}>
            <Link
              href={`/docs/${slug}`}
              className="group/doc block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="h-full gap-3 transition-colors group-hover/doc:border-input group-hover/doc:bg-accent/40">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground">
                      <Icon className="size-4" />
                    </span>
                    <CardTitle className="flex-1">{title}</CardTitle>
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/doc:translate-x-0.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
