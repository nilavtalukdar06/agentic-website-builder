import { parseAsStringLiteral } from "nuqs/server";

export const designSections = [
  "brand",
  "color",
  "typography",
  "radius",
  "components",
  "ai-elements",
  "patterns",
] as const;

export type DesignSection = (typeof designSections)[number];

export const designThemes = ["light", "dark", "system"] as const;

export type DesignTheme = (typeof designThemes)[number];

export const designSearchParams = {
  section: parseAsStringLiteral(designSections),
  theme: parseAsStringLiteral(designThemes),
};

export const designSectionTitles: Record<DesignSection, string> = {
  brand: "Brand",
  color: "Color",
  typography: "Typography",
  radius: "Radius & states",
  components: "Components",
  "ai-elements": "AI Elements",
  patterns: "Patterns",
};
