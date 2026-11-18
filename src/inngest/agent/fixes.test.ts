import { describe, expect, test } from "vitest";
import { clientDirectiveFixes, needsUseClient } from "./fixes";

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
