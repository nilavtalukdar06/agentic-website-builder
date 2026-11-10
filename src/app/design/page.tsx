import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AiElementsSection } from "./_components/ai-elements-section";
import { BrandSection } from "./_components/brand-section";
import { ColorSection } from "./_components/color-section";
import { ComponentsSection } from "./_components/components-section";
import { DesignNav } from "./_components/design-nav";
import { DesignUrlState } from "./_components/design-url-state";
import { PatternsSection } from "./_components/patterns-section";
import { RadiusSection } from "./_components/radius-section";
import { TypographySection } from "./_components/typography-section";

export const metadata: Metadata = {
  title: "Design system",
  description: "Vibe tokens, logo, components and patterns.",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 pb-24 lg:px-16">
      <Suspense>
        <DesignUrlState />
      </Suspense>
      <header className="flex flex-col gap-6 pt-14 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="text-caption">Design system · v3 (flat)</p>
          <h1 className="text-display">Vibe</h1>
          <p className="text-body text-muted-foreground">
            shadcn/ui v4 semantic tokens in OKLCH. Flat like Replit: neutral
            greys, 1px borders, no shadows. Color is reserved for focus rings,
            status and third-party logos. AI surfaces follow Vercel AI Elements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            --radius: 0.5rem
          </Badge>
          <Badge variant="outline" className="font-mono">
            Geist / Geist Mono
          </Badge>
        </div>
      </header>
      <Suspense fallback={<Skeleton className="h-12 w-full" />}>
        <DesignNav />
      </Suspense>
      <BrandSection />
      <ColorSection />
      <TypographySection />
      <RadiusSection />
      <ComponentsSection />
      <AiElementsSection />
      <PatternsSection />
    </main>
  );
}
