import type { Metadata } from "next";
import { ArticleBody, ArticleLayout } from "@/components/marketing/prose";
import { LEGAL_UPDATED, LEGAL_UPDATED_ISO } from "@/lib/legal";
import { termsSections } from "./_content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Vibe.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ArticleLayout
      title="Terms of Service"
      description="The rules for using Vibe, in plain language."
      sections={termsSections}
      meta={
        <p className="text-caption text-muted-foreground">
          Last updated <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED}</time>
        </p>
      }
    >
      <ArticleBody sections={termsSections} />
    </ArticleLayout>
  );
}
