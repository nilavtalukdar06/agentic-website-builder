import type { Metadata } from "next";
import { ArticleBody, ArticleLayout } from "@/components/marketing/prose";
import { LEGAL_UPDATED, LEGAL_UPDATED_ISO } from "@/lib/legal";
import { privacySections } from "./_content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Vibe collects, why, who it is shared with, and your choices.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ArticleLayout
      title="Privacy Policy"
      description="What we collect, why we collect it, and the choices you have."
      sections={privacySections}
      meta={
        <p className="text-caption text-muted-foreground">
          Last updated <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED}</time>
        </p>
      }
    >
      <ArticleBody sections={privacySections} />
    </ArticleLayout>
  );
}
