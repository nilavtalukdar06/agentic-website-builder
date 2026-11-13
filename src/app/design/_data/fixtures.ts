import {
  BookOpenIcon,
  PackageIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import type { GeneratingFile } from "@/components/workspace/generating-overlay";
import type { AgentModel } from "@/lib/ai/models";

export const sampleUser = { name: "Nilav", plan: "Pay as you go" };

export const sampleCredits = { balance: 1198, allowance: 2000 };

export const sampleProjects = [
  {
    name: "Ember & Oak Roasters",
    slug: "ember-oak-roasters",
    description:
      "Editorial landing page for a small-batch coffee roaster with a shop grid and café CTA.",
    editedLabel: "Edited 12 minutes ago",
    onGithub: false,
  },
  {
    name: "Lumen analytics",
    slug: "lumen-analytics",
    description:
      "Marketing site and pricing page for a product analytics SaaS.",
    editedLabel: "Edited 2 hours ago",
    onGithub: true,
  },
  {
    name: "Studio Kiran portfolio",
    slug: "studio-kiran",
    description:
      "Minimal portfolio for an architecture studio with a project gallery.",
    editedLabel: "Edited yesterday",
    onGithub: true,
  },
  {
    name: "Pawprint vet clinic",
    slug: "pawprint-vet",
    description:
      "Clinic site with services, vet profiles and an appointment form.",
    editedLabel: "Edited 3 days ago",
    onGithub: false,
  },
  {
    name: "Northwind travel journal",
    slug: "northwind-journal",
    description: "MDX travel blog with tag filters and a dark mode toggle.",
    editedLabel: "Edited last week",
    onGithub: true,
  },
  {
    name: "Hackathon 2026",
    slug: "hackathon-2026",
    description: "Event page with schedule, tracks, judges and an FAQ.",
    editedLabel: "Edited 2 weeks ago",
    onGithub: true,
  },
];

export const sampleRecentProjects = sampleProjects
  .slice(0, 4)
  .map((project) => ({ name: project.name, href: `/p/${project.slug}` }));

export const samplePrompt =
  "Build a landing page for Ember & Oak, a small-batch coffee roaster. Warm and editorial, serif headlines, a shop section with three roasts and a café visit CTA.";

export const sampleReasoning =
  "The brief asks for an editorial feel, so I'll pair a serif display face with Geist body text. Framer Motion handles gentle reveals; the roast grid reads from a typed array so it's easy to extend.";

export const sampleAssistantIntro =
  "I'll start from a clean Next.js sandbox, add Framer Motion for gentle reveals, then build the hero, a roast grid and a café footer.";

export const sampleSummary = `Ember & Oak is running in your sandbox. Here's what I built:

- Editorial hero with an Instrument Serif headline and two CTAs
- A \`RoastGrid\` with three roasts and tasting notes
- Footer with café hours and a visit CTA`;

export const sampleSuggestions = [
  "SaaS landing page",
  "Developer portfolio",
  "Restaurant menu",
  "Admin dashboard",
  "Event page",
];

export const sampleFollowUps = [
  "Add a subscription plan",
  "Newsletter signup",
  "Darker hero",
];

export const sampleTaskItems = [
  { verb: "Created", path: "components/roast-grid.tsx" },
  { verb: "Edited", path: "lib/utils.ts" },
  { verb: "Edited", path: "app/globals.css" },
];

export const sampleTerminalOutput = `$ next dev --turbopack
▲ Next.js 16 (Turbopack)
✓ Ready on http://localhost:3000
○ Compiling / …`;

export const sampleConsoleLogs = [
  {
    level: "log" as const,
    message: "next dev · ready in 1.2s",
    timestamp: new Date("2026-11-10T21:32:04Z"),
  },
  {
    level: "warn" as const,
    message: "Image with src /beans.jpg has no width",
    timestamp: new Date("2026-11-10T21:32:06Z"),
  },
  {
    level: "error" as const,
    message: "Hydration mismatch in components/footer.tsx",
    timestamp: new Date("2026-11-10T21:32:08Z"),
  },
];

export const samplePreviewUrl = "https://sbx-8f2a1c.vibe.run/";

export const sampleGeneratingFiles: GeneratingFile[] = [
  { path: "components/roast-grid.tsx", verb: "Created", status: "done" },
  { path: "lib/utils.ts", verb: "Edited", status: "done" },
  { path: "app/globals.css", verb: "Edited", status: "done" },
  { path: "components/footer.tsx", verb: "Creating", status: "active" },
  { path: "tailwind.config.ts", verb: "Up next", status: "next" },
];

export type SampleTreeNode =
  | { type: "folder"; name: string; path: string; children: SampleTreeNode[] }
  | { type: "file"; name: string; path: string; marker?: "A" | "M" };

export const sampleFileTree: SampleTreeNode[] = [
  {
    type: "folder",
    name: "app",
    path: "app",
    children: [
      { type: "file", name: "layout.tsx", path: "app/layout.tsx", marker: "M" },
      { type: "file", name: "page.tsx", path: "app/page.tsx", marker: "M" },
      {
        type: "file",
        name: "globals.css",
        path: "app/globals.css",
        marker: "M",
      },
    ],
  },
  {
    type: "folder",
    name: "components",
    path: "components",
    children: [
      {
        type: "file",
        name: "hero.tsx",
        path: "components/hero.tsx",
        marker: "A",
      },
      {
        type: "file",
        name: "roast-grid.tsx",
        path: "components/roast-grid.tsx",
        marker: "A",
      },
      {
        type: "file",
        name: "footer.tsx",
        path: "components/footer.tsx",
        marker: "A",
      },
    ],
  },
  {
    type: "folder",
    name: "lib",
    path: "lib",
    children: [
      { type: "file", name: "utils.ts", path: "lib/utils.ts", marker: "M" },
    ],
  },
  { type: "file", name: "next.config.ts", path: "next.config.ts" },
  { type: "file", name: "package.json", path: "package.json", marker: "M" },
  { type: "file", name: "tsconfig.json", path: "tsconfig.json" },
];

export const sampleCode = `import { Hero } from "@/components/hero";
import { RoastGrid } from "@/components/roast-grid";
import { Footer } from "@/components/footer";

export const metadata = {
  title: "Ember & Oak Roasters",
  description: "Small-batch coffee, roasted slow.",
};

export default function Page() {
  return (
    <main className="min-h-screen">
      <Hero title="Coffee roasted slow, poured with care." />
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-serif text-4xl">This week's roasts</h2>
        <RoastGrid limit={3} />
      </section>
      <Footer showVisitCta />
    </main>
  );
}`;

export const sampleActivity = [
  {
    date: "10 Nov, 21:32",
    project: "Ember & Oak Roasters",
    description: "Generated landing page · 8 files",
    credits: -42,
  },
  {
    date: "10 Nov, 18:05",
    project: "Lumen analytics",
    description: "Edited pricing table copy",
    credits: -6,
  },
  {
    date: "9 Nov, 12:10",
    project: null,
    description: "Top-up · $20.00",
    credits: 2000,
  },
  {
    date: "8 Nov, 16:20",
    project: "Pawprint vet clinic",
    description: "Generated site · 11 files",
    credits: -51,
  },
];

export const sampleModels: AgentModel[] = [
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    vision: true,
    pricing: {
      inputPerMTok: 2,
      outputPerMTok: 10,
      cachedInputPerMTok: 0.2,
      cacheWritePerMTok: 2.5,
    },
  },
  {
    id: "openai/gpt-5.3-codex",
    name: "GPT 5.3 Codex",
    provider: "openai",
    providerLabel: "OpenAI",
    vision: true,
    pricing: {
      inputPerMTok: 1.75,
      outputPerMTok: 14,
      cachedInputPerMTok: 0.175,
      cacheWritePerMTok: null,
    },
  },
  {
    id: "zai/glm-5.3",
    name: "GLM 5.3",
    provider: "zai",
    providerLabel: "Z.ai",
    vision: false,
    pricing: {
      inputPerMTok: 1.4,
      outputPerMTok: 4.4,
      cachedInputPerMTok: null,
      cacheWritePerMTok: null,
    },
  },
];

export const sampleAttachments = [
  {
    id: "sample-1",
    type: "file" as const,
    filename: "hero-reference.png",
    mediaType: "image/png",
    url: "/window.svg",
  },
  {
    id: "sample-2",
    type: "file" as const,
    filename: "palette.png",
    mediaType: "image/png",
    url: "/globe.svg",
  },
];

export const sampleSources = [
  { title: "Stripe Pricing", url: "https://stripe.com/pricing" },
  { title: "Stripe Docs — Billing", url: "https://docs.stripe.com/billing" },
  { title: "Stripe Press", url: "https://press.stripe.com" },
];

export const sampleRunSteps: GeneratingFile[] = [
  {
    id: "1",
    path: "frontend-design",
    verb: "Loaded skill",
    status: "done",
    icon: SparklesIcon,
  },
  {
    id: "2",
    path: "AGENTS.md, app/page.tsx",
    verb: "Read",
    status: "done",
    icon: BookOpenIcon,
  },
  {
    id: "3",
    path: "motion",
    verb: "Installed",
    status: "done",
    icon: PackageIcon,
  },
  {
    id: "4",
    path: "components/roast-grid.tsx",
    verb: "Created",
    status: "done",
  },
  {
    id: "5",
    path: "npm run lint",
    verb: "Running",
    status: "active",
    icon: TerminalIcon,
  },
];
