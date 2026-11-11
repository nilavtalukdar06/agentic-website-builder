import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const iconsDir = require
  .resolve("@lobehub/icons-static-svg/package.json")
  .replace("package.json", "icons/");

const logos = {
  claude: "claude-color",
  codex: "codex-color",
  openai: "openai",
  gemini: "gemini-color",
  kimi: "kimi-color",
  zai: "zai",
  deepseek: "deepseek-color",
  alibaba: "alibaba-color",
  mistral: "mistral-color",
};

const keptAttributes = ["fill-rule", "clip-rule"];
const unsafe = /<style|<script|<foreignObject|<image|<use|\shref=|\son[a-z]+=/i;

const entries = Object.entries(logos).map(([key, file]) => {
  const svg = readFileSync(`${iconsDir}${file}.svg`, "utf8").trim();
  const match = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(svg);
  if (!match) throw new Error(`Unexpected SVG in ${file}.svg`);
  const [, attributes, inner] = match;

  if (unsafe.test(svg)) {
    throw new Error(`${file}.svg contains markup that is not a plain logo`);
  }

  const viewBox = /viewBox="([^"]+)"/.exec(attributes)?.[1];
  if (!viewBox) throw new Error(`${file}.svg has no viewBox`);

  const body = inner.replace(/<title>[\s\S]*?<\/title>/, "");
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((found) => found[1]);
  const references = [...body.matchAll(/url\(#([^)]+)\)/g)].map(
    (found) => found[1],
  );
  const dangling = references.filter((reference) => !ids.includes(reference));
  if (dangling.length > 0) {
    throw new Error(
      `${file}.svg references missing ids: ${dangling.join(", ")}`,
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${file}.svg repeats an id`);
  }

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

  return `  ${key}: { viewBox: ${JSON.stringify(viewBox)}, ids: ${JSON.stringify(ids)}, body: ${JSON.stringify(markup)} },`;
});

const output = `export const modelLogoData = {
${entries.join("\n")}
} as const;

export type ModelLogoKey = keyof typeof modelLogoData;
`;

writeFileSync(
  new URL("../src/components/models/model-logos.generated.ts", import.meta.url),
  output,
);
