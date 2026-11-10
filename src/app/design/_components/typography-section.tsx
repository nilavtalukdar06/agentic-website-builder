import { DesignSection } from "./section";

const specimens = [
  { label: "34 · 500 · −2%", className: "text-display", text: "Display" },
  { label: "28 · 500", className: "text-page-title", text: "Page title" },
  { label: "15 · 600", className: "text-card-title", text: "Card title" },
  { label: "14 · 400", className: "text-body", text: "Body and UI text" },
  {
    label: "13 · muted",
    className: "text-caption text-muted-foreground",
    text: "Muted description",
  },
  {
    label: "Mono 13",
    className: "font-mono text-caption",
    text: "npm run dev",
  },
];

export function TypographySection() {
  return (
    <DesignSection
      id="typography"
      description="Geist for UI, Geist Mono for code."
    >
      <dl className="flex flex-col divide-y rounded-xl border bg-card px-5">
        {specimens.map((specimen) => (
          <div
            key={specimen.label}
            className="flex items-baseline justify-between gap-4 py-4"
          >
            <dd className={specimen.className}>{specimen.text}</dd>
            <dt className="shrink-0 font-mono text-xs text-muted-foreground">
              {specimen.label}
            </dt>
          </div>
        ))}
      </dl>
    </DesignSection>
  );
}
