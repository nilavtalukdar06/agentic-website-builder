import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const iconsDir = require
  .resolve("@lobehub/icons-static-svg/package.json")
  .replace("package.json", "icons/");

const logos = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  moonshotai: "moonshot",
  zai: "zai",
  deepseek: "deepseek",
  alibaba: "alibaba",
  mistral: "mistral",
};

const keptAttributes = ["fill-rule", "clip-rule"];

const entries = Object.entries(logos).map(([provider, file]) => {
  const svg = readFileSync(`${iconsDir}${file}.svg`, "utf8").trim();
  const match = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(svg);
  if (!match) throw new Error(`Unexpected SVG in ${file}.svg`);
  const [, attributes, inner] = match;

  if (/<defs|<style|<linearGradient|<radialGradient|\sid=|url\(/.test(svg)) {
    throw new Error(`${file}.svg is not a plain single-color mark`);
  }

  const viewBox = /viewBox="([^"]+)"/.exec(attributes)?.[1];
  if (!viewBox) throw new Error(`${file}.svg has no viewBox`);

  const body = inner.replace(/<title>[\s\S]*?<\/title>/, "");
  const wrapperAttributes = keptAttributes
    .map((name) => {
      const value = new RegExp(`${name}="([^"]+)"`).exec(attributes)?.[1];
      return value ? `${name}="${value}"` : null;
    })
    .filter(Boolean)
    .join(" ");
  const markup = wrapperAttributes
    ? `<g ${wrapperAttributes}>${body}</g>`
    : body;

  return `  ${provider}: { viewBox: ${JSON.stringify(viewBox)}, body: ${JSON.stringify(markup)} },`;
});

const output = `export const modelLogoData = {
${entries.join("\n")}
} as const;

export type ModelLogoProvider = keyof typeof modelLogoData;
`;

writeFileSync(
  new URL("../src/components/models/model-logos.generated.ts", import.meta.url),
  output,
);
