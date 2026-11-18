import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "sandbox-templates/nextjs/blocks");
const out = join(root, "src/inngest/agent/blocks.generated.ts");

const descriptions = {
  "site-header":
    "Sticky top navigation with brand, links, CTA and a mobile menu (client).",
  "site-footer": "Footer with brand, tagline, link columns and legal line.",
  "hero-centered":
    "Centered landing hero with eyebrow badge, headline, text, two CTAs and a soft glow.",
  "hero-split":
    "Two-column hero: copy, CTAs and highlights on the left, a visual slot (ReactNode) on the right.",
  "section-heading": "Eyebrow, h2 and description for any section.",
  "logo-cloud": "Row of customer or partner names as wordmarks.",
  "feature-grid":
    "Grid of feature cards with a lucide icon, title and description.",
  stats: "Band of 2–4 big numbers with labels.",
  pricing: "2–3 pricing plans with features and a featured plan.",
  testimonials: "Quote cards with initials avatars, name and role.",
  faq: "Accessible FAQ accordion built on details/summary.",
  "cta-banner": "Full-width primary-coloured call-to-action band.",
  "contact-form":
    "Contact form with name, email, message, sending state and success message (client).",
  "app-shell":
    "Dashboard layout: sidebar nav with active state, top bar with title and actions, mobile nav (client).",
  "stat-cards": "KPI cards with value, change and trend for dashboards.",
  "data-table":
    "Generic table with typed columns, optional search box and empty row (client).",
  "empty-state": "Dashed empty state with icon, text and an action slot.",
};

const files = readdirSync(dir)
  .filter((file) => file.endsWith(".tsx"))
  .sort();

const blocks = files.map((file) => {
  const name = file.slice(0, -4);
  const source = readFileSync(join(dir, file), "utf8");
  const description = descriptions[name];
  if (!description) throw new Error(`Missing description for block ${name}`);
  const types = [
    ...source.matchAll(/export type [\s\S]*?\n};|export type [^\n]*;/g),
  ].map((match) => match[0]);
  const exports = [...source.matchAll(/export function ([A-Za-z]\w*)/g)].map(
    (match) => match[1],
  );
  const uses = [...source.matchAll(/from "\.\/([\w-]+)"/g)].map(
    (match) => match[1],
  );
  return {
    name,
    path: `components/blocks/${file}`,
    description,
    exports,
    uses,
    props: types.join("\n"),
    source,
  };
});

const body = `export type Block = {
  name: string;
  path: string;
  description: string;
  exports: string[];
  uses: string[];
  props: string;
  source: string;
};

export const BLOCKS: Block[] = ${JSON.stringify(blocks, null, 2)};
`;

writeFileSync(out, body);
console.log(`Wrote ${blocks.length} blocks to ${out}`);
