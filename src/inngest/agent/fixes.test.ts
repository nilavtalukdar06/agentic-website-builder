import { describe, expect, test } from "vitest";
import {
  clientDirectiveFixes,
  fixLucideTitles,
  needsUseClient,
  sourceFixes,
} from "./fixes";

describe("needsUseClient", () => {
  test.each([
    [
      "components/counter.tsx",
      "export function C() { const [n] = useState(0); }",
      true,
    ],
    [
      "components/b.tsx",
      "export const B = () => <button onClick={() => go()}>x</button>;",
      true,
    ],
    [
      "components/s.tsx",
      "export function S() { return localStorage.getItem('x'); }",
      true,
    ],
    ["components/c.tsx", '"use client";\nuseState(0);', false],
    ["components/c.tsx", "// note\n'use client'\nuseState(0);", false],
    [
      "app/page.tsx",
      "export const metadata = {};\nexport default function P() { useState(0); }",
      false,
    ],
    [
      "components/static.tsx",
      "export function S() { return <p>Hi</p>; }",
      false,
    ],
    ["lib/data.ts", "useState(0)", false],
    ["components/ui/button.tsx", "onClick={x}", false],
  ])("%s → %s", (path, content, expected) => {
    expect(needsUseClient(path, content)).toBe(expected);
  });
});

describe("clientDirectiveFixes", () => {
  test("adds the directive only where it's missing", () => {
    expect(
      clientDirectiveFixes([
        { path: "components/a.tsx", content: "useEffect(() => {}, []);" },
        { path: "components/b.tsx", content: "export const B = 1;" },
      ]),
    ).toEqual([
      {
        path: "components/a.tsx",
        content: '"use client";\n\nuseEffect(() => {}, []);',
      },
    ]);
  });
});

describe("fixLucideTitles", () => {
  test("turns title on lucide icons into aria-label and leaves other elements alone", () => {
    const source = `import { Check, Trash2 as Bin } from "lucide-react";\nexport function A() {\n  return (\n    <div title="row">\n      <Check className="size-4" title="Done" />\n      <Bin\n        title={label}\n      />\n    </div>\n  );\n}`;
    const fixed = fixLucideTitles(source);
    expect(fixed).toContain('<div title="row">');
    expect(fixed).toContain('<Check className="size-4" aria-label="Done" />');
    expect(fixed).toContain("aria-label={label}");
    expect(fixed).not.toMatch(/<(Check|Bin)[^>]*\stitle=/);
  });

  test("returns files without lucide imports unchanged", () => {
    const source = `export const A = () => <Check title="x" />;`;
    expect(fixLucideTitles(source)).toBe(source);
  });
});

describe("sourceFixes", () => {
  test("combines the lucide and use client fixes and skips untouched files", () => {
    const files = [
      {
        path: "components/a.tsx",
        content: `import { X } from "lucide-react";\nexport function A() { const [o] = useState(false); return <X title="Close" />; }`,
      },
      { path: "components/b.tsx", content: "export const B = 1;" },
      { path: "lib/c.ts", content: "export const C = 1;" },
    ];
    const fixed = sourceFixes(files);
    expect(fixed).toHaveLength(1);
    expect(fixed[0].content.startsWith('"use client";')).toBe(true);
    expect(fixed[0].content).toContain('aria-label="Close"');
  });
});
