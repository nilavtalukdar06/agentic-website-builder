export type ColorToken = {
  name: string;
  light: string;
  dark: string;
  derived?: boolean;
};

export type TokenGroup = { title: string; tokens: ColorToken[] };

export const canvasTokens: ColorToken[] = [
  { name: "background", light: "oklch(0.99 0 0)", dark: "oklch(0.195 0 0)" },
  { name: "foreground", light: "oklch(0.18 0 0)", dark: "oklch(0.95 0 0)" },
  { name: "card", light: "oklch(1 0 0)", dark: "oklch(0.21 0 0)" },
  { name: "primary", light: "oklch(0.2 0 0)", dark: "oklch(0.95 0 0)" },
  { name: "secondary", light: "oklch(0.96 0 0)", dark: "oklch(0.26 0 0)" },
  {
    name: "muted-foreground",
    light: "oklch(0.49 0 0)",
    dark: "oklch(0.74 0 0)",
  },
  { name: "accent", light: "oklch(0.95 0 0)", dark: "oklch(0.27 0 0)" },
  { name: "border", light: "oklch(0.9 0 0)", dark: "oklch(0.32 0 0)" },
  { name: "input", light: "oklch(0.88 0 0)", dark: "oklch(0.34 0 0)" },
  {
    name: "ring",
    light: "oklch(0.524 0.24 264.4)",
    dark: "oklch(0.706 0.139 264.4)",
  },
  { name: "sidebar", light: "oklch(0.975 0 0)", dark: "oklch(0.21 0 0)" },
  {
    name: "destructive",
    light: "oklch(0.55 0.22 26.6)",
    dark: "oklch(0.702 0.156 26.6)",
  },
  {
    name: "success",
    light: "oklch(0.52 0.169 138.2)",
    dark: "oklch(0.66 0.155 138.2)",
  },
  {
    name: "brand",
    light: "oklch(0.524 0.24 264.4)",
    dark: "oklch(0.62 0.2 264.4)",
  },
];

export const derivedTokens: ColorToken[] = [
  {
    name: "popover",
    light: "oklch(1 0 0)",
    dark: "oklch(0.21 0 0)",
    derived: true,
  },
  {
    name: "muted",
    light: "oklch(0.96 0 0)",
    dark: "oklch(0.26 0 0)",
    derived: true,
  },
  {
    name: "tab-active",
    light: "oklch(1 0 0)",
    dark: "oklch(0.3 0 0)",
    derived: true,
  },
  {
    name: "warning",
    light: "oklch(0.555 0.13 62)",
    dark: "oklch(0.78 0.14 75)",
    derived: true,
  },
  {
    name: "destructive-foreground",
    light: "oklch(0.985 0 0)",
    dark: "oklch(0.2 0 0)",
    derived: true,
  },
  {
    name: "success-foreground",
    light: "oklch(0.985 0 0)",
    dark: "oklch(0.2 0 0)",
    derived: true,
  },
  {
    name: "brand-foreground",
    light: "oklch(0.985 0 0)",
    dark: "oklch(0.2 0 0)",
    derived: true,
  },
];

export const chartTokens: ColorToken[] = [
  {
    name: "chart-1",
    light: "oklch(0.25 0 0)",
    dark: "oklch(0.9 0 0)",
    derived: true,
  },
  {
    name: "chart-2",
    light: "oklch(0.4 0 0)",
    dark: "oklch(0.72 0 0)",
    derived: true,
  },
  {
    name: "chart-3",
    light: "oklch(0.55 0 0)",
    dark: "oklch(0.55 0 0)",
    derived: true,
  },
  {
    name: "chart-4",
    light: "oklch(0.7 0 0)",
    dark: "oklch(0.42 0 0)",
    derived: true,
  },
  {
    name: "chart-5",
    light: "oklch(0.85 0 0)",
    dark: "oklch(0.32 0 0)",
    derived: true,
  },
];

export const codeTokens: ColorToken[] = [
  {
    name: "code-kw",
    light: "oklch(0.552 0.205 24.5)",
    dark: "oklch(0.734 0.163 25.8)",
    derived: true,
  },
  {
    name: "code-str",
    light: "oklch(0.321 0.108 259.1)",
    dark: "oklch(0.856 0.077 244.1)",
    derived: true,
  },
  {
    name: "code-fn",
    light: "oklch(0.563 0.207 295)",
    dark: "oklch(0.801 0.127 305.9)",
    derived: true,
  },
  {
    name: "code-tag",
    light: "oklch(0.439 0.118 148.1)",
    dark: "oklch(0.842 0.164 145.8)",
    derived: true,
  },
  {
    name: "code-attr",
    light: "oklch(0.451 0.164 258.2)",
    dark: "oklch(0.786 0.115 246.7)",
    derived: true,
  },
  {
    name: "code-punc",
    light: "oklch(0.254 0.011 254)",
    dark: "oklch(0.943 0.011 243.7)",
    derived: true,
  },
  {
    name: "code-ln",
    light: "oklch(0.565 0.019 251)",
    dark: "oklch(0.563 0.02 256.3)",
    derived: true,
  },
];

export const allColorTokens = [
  ...canvasTokens,
  ...derivedTokens,
  ...chartTokens,
  ...codeTokens,
];

export const contrastPairs = [
  { name: "Page", background: "background", foreground: "foreground" },
  {
    name: "Muted text",
    background: "background",
    foreground: "muted-foreground",
  },
  { name: "Card", background: "card", foreground: "card-foreground" },
  { name: "Primary", background: "primary", foreground: "primary-foreground" },
  {
    name: "Secondary",
    background: "secondary",
    foreground: "secondary-foreground",
  },
  { name: "Accent", background: "accent", foreground: "accent-foreground" },
  {
    name: "Destructive",
    background: "destructive",
    foreground: "destructive-foreground",
  },
  { name: "Success", background: "success", foreground: "success-foreground" },
  { name: "Brand", background: "brand", foreground: "brand-foreground" },
  { name: "Sidebar", background: "sidebar", foreground: "sidebar-foreground" },
] as const;
