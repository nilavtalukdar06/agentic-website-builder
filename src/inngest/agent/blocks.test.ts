import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  blockCatalog,
  blockFiles,
  blockNames,
  blockReference,
  isBlockName,
} from "./blocks";
import { BLOCKS } from "./blocks.generated";

const dir = join(process.cwd(), "sandbox-templates/nextjs/blocks");

describe("block catalog", () => {
  test("the generated module matches the block sources (run bun run blocks:generate)", () => {
    const files = readdirSync(dir).filter((file) => file.endsWith(".tsx"));
    expect(BLOCKS.map((block) => `${block.name}.tsx`).sort()).toEqual(
      files.sort(),
    );
    for (const block of BLOCKS) {
      expect(block.source).toBe(
        readFileSync(join(dir, `${block.name}.tsx`), "utf8"),
      );
    }
  });

  test("every block exports a component and its props", () => {
    for (const block of BLOCKS) {
      expect(block.exports.length).toBeGreaterThan(0);
      expect(block.props).toContain("Props");
    }
  });

  test("blocks only import components every template has", () => {
    for (const block of BLOCKS) {
      for (const match of block.source.matchAll(/from "(@\/[^"]+)"/g)) {
        expect(match[1]).toMatch(/^@\/(components\/ui\/|lib\/utils$)/);
      }
    }
  });

  test("copying a block brings the blocks it uses", () => {
    const paths = blockFiles(["faq"]).map((file) => file.path);
    expect(paths).toEqual([
      "components/blocks/faq.tsx",
      "components/blocks/section-heading.tsx",
    ]);
  });

  test("lists every block and describes the ones in use", () => {
    expect(blockCatalog().split("\n")).toHaveLength(blockNames.length);
    expect(blockReference(["pricing"])).toContain("export type PricingPlan");
    expect(blockReference([])).toBe("");
    expect(isBlockName("pricing")).toBe(true);
    expect(isBlockName("mega-menu")).toBe(false);
  });
});
