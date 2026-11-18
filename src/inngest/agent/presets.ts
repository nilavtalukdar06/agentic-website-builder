export const presetNames = [
  "neutral",
  "ocean",
  "forest",
  "sunset",
  "violet",
  "rose",
] as const;

export type PresetName = (typeof presetNames)[number];

type Tokens = Record<string, string>;

export type Preset = {
  description: string;
  radius: string;
  light: Tokens;
  dark: Tokens;
};

function accentTokens(
  hue: number,
  chroma: number,
  lightness: { light: number; dark: number },
): { light: Tokens; dark: Tokens } {
  const color = (l: number, c = chroma) => `oklch(${l} ${c} ${hue})`;
  return {
    light: {
      primary: color(lightness.light),
      "primary-foreground": "oklch(0.985 0 0)",
      accent: color(0.96, chroma * 0.18),
      "accent-foreground": color(0.3),
      ring: color(lightness.light),
      "chart-1": color(lightness.light),
      "chart-2": color(lightness.light + 0.12, chroma * 0.8),
      "chart-3": color(lightness.light + 0.22, chroma * 0.6),
      "chart-4": color(lightness.light - 0.1, chroma * 0.9),
      "chart-5": color(lightness.light + 0.3, chroma * 0.4),
    },
    dark: {
      primary: color(lightness.dark),
      "primary-foreground": "oklch(0.18 0 0)",
      accent: color(0.28, chroma * 0.3),
      "accent-foreground": color(0.92, chroma * 0.4),
      ring: color(lightness.dark),
      "chart-1": color(lightness.dark),
      "chart-2": color(lightness.dark - 0.1, chroma * 0.8),
      "chart-3": color(lightness.dark - 0.2, chroma * 0.6),
      "chart-4": color(lightness.dark + 0.08, chroma * 0.7),
      "chart-5": color(lightness.dark - 0.3, chroma * 0.4),
    },
  };
}

export const presets: Record<PresetName, Preset> = {
  neutral: {
    description:
      "Monochrome, editorial and calm. Fits portfolios, agencies, studios and minimal products.",
    radius: "0.5rem",
    light: {
      primary: "oklch(0.21 0 0)",
      "primary-foreground": "oklch(0.985 0 0)",
      accent: "oklch(0.96 0 0)",
      "accent-foreground": "oklch(0.21 0 0)",
      ring: "oklch(0.55 0 0)",
    },
    dark: {
      primary: "oklch(0.95 0 0)",
      "primary-foreground": "oklch(0.21 0 0)",
      accent: "oklch(0.27 0 0)",
      "accent-foreground": "oklch(0.95 0 0)",
      ring: "oklch(0.6 0 0)",
    },
  },
  ocean: {
    description:
      "Trustworthy blue. Fits SaaS, fintech, developer tools and dashboards.",
    radius: "0.625rem",
    ...accentTokens(250, 0.17, { light: 0.52, dark: 0.68 }),
  },
  forest: {
    description:
      "Fresh green. Fits health, sustainability, food, outdoors and finance growth.",
    radius: "0.75rem",
    ...accentTokens(155, 0.14, { light: 0.5, dark: 0.7 }),
  },
  sunset: {
    description:
      "Warm orange. Fits restaurants, cafés, events, travel and creative brands.",
    radius: "1rem",
    ...accentTokens(45, 0.17, { light: 0.62, dark: 0.72 }),
  },
  violet: {
    description:
      "Bold purple. Fits AI products, creative tools, gaming and modern startups.",
    radius: "0.75rem",
    ...accentTokens(290, 0.2, { light: 0.52, dark: 0.7 }),
  },
  rose: {
    description:
      "Soft pink-red. Fits beauty, fashion, wellness, weddings and lifestyle brands.",
    radius: "1rem",
    ...accentTokens(10, 0.17, { light: 0.58, dark: 0.72 }),
  },
};

function blockRange(css: string, selector: RegExp) {
  const match = selector.exec(css);
  if (!match) return null;
  const open = css.indexOf("{", match.index);
  if (open === -1) return null;
  const close = css.indexOf("}", open);
  if (close === -1) return null;
  return { open, close };
}

function setTokens(css: string, selector: RegExp, tokens: Tokens) {
  const range = blockRange(css, selector);
  if (!range) return css;
  let body = css.slice(range.open + 1, range.close);
  const missing: string[] = [];
  for (const [name, value] of Object.entries(tokens)) {
    const pattern = new RegExp(`(--${name}\\s*:\\s*)[^;]+;`);
    if (pattern.test(body)) {
      body = body.replace(pattern, `$1${value};`);
    } else {
      missing.push(`  --${name}: ${value};`);
    }
  }
  if (missing.length > 0) {
    body = `${body.replace(/\s*$/, "")}\n${missing.join("\n")}\n`;
  }
  return css.slice(0, range.open + 1) + body + css.slice(range.close);
}

export function applyPreset(css: string, name: PresetName) {
  const preset = presets[name];
  const withLight = setTokens(css, /(^|\n)\s*:root\b/, {
    ...preset.light,
    radius: preset.radius,
  });
  return setTokens(withLight, /(^|\n)\s*\.dark\s*\{/, preset.dark);
}

export function presetCatalog() {
  return presetNames
    .map((name) => `- ${name}: ${presets[name].description}`)
    .join("\n");
}
