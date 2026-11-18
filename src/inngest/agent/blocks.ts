import { type Block, BLOCKS } from "./blocks.generated";

export const blockNames = BLOCKS.map((block) => block.name);

const byName = new Map(BLOCKS.map((block) => [block.name, block]));

export function isBlockName(name: string) {
  return byName.has(name);
}

export function blockCatalog() {
  return BLOCKS.map(
    (block) =>
      `- ${block.name} (${block.exports.join(", ")} from "@/components/blocks/${block.name}"): ${block.description}`,
  ).join("\n");
}

export function withDependencies(names: string[]) {
  const seen = new Set<string>();
  const visit = (name: string) => {
    const block = byName.get(name);
    if (!block || seen.has(name)) return;
    seen.add(name);
    for (const used of block.uses) visit(used);
  };
  for (const name of names) visit(name);
  return BLOCKS.filter((block) => seen.has(block.name));
}

export function blockFiles(names: string[]) {
  return withDependencies(names).map((block) => ({
    path: block.path,
    content: block.source,
  }));
}

function describeBlock(block: Block) {
  return `### ${block.name}\nimport { ${block.exports.join(", ")} } from "@/components/blocks/${block.name}";\n${block.description}\n${block.props}`;
}

export function blockReference(names: string[]) {
  const blocks = withDependencies(names);
  return blocks.length > 0 ? blocks.map(describeBlock).join("\n\n") : "";
}
