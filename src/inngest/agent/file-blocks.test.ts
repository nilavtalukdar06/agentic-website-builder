import { describe, expect, test } from "vitest";
import { parseFileBlocks, unclosedFile } from "./file-blocks";

describe("parseFileBlocks", () => {
  test("reads each file block, removing stray fences and trailing space", () => {
    const text = `Here you go.
<file path="app/page.tsx">
export default function Home() {}
</file>
<file path="./components/hero.tsx">
\`\`\`tsx
export function Hero() {}
\`\`\`
</file>`;
    expect(parseFileBlocks(text)).toEqual([
      { path: "app/page.tsx", content: "export default function Home() {}\n" },
      { path: "components/hero.tsx", content: "export function Hero() {}\n" },
    ]);
  });

  test("keeps the last copy of a repeated file and skips empty ones", () => {
    const text =
      '<file path="a.ts">one</file><file path="a.ts">two</file><file path="b.ts">\n</file>';
    expect(parseFileBlocks(text)).toEqual([{ path: "a.ts", content: "two\n" }]);
  });

  test("ignores a file cut off by the output limit", () => {
    const text =
      '<file path="a.ts">done</file>\n<file path="b.ts">\nexport const';
    expect(parseFileBlocks(text)).toEqual([
      { path: "a.ts", content: "done\n" },
    ]);
    expect(unclosedFile(text)).toBe("b.ts");
    expect(unclosedFile('<file path="a.ts">x</file>')).toBeNull();
  });
});
