import { describe, expect, test } from "vitest";
import type { Diagnostic } from "@/server/sandbox/diagnostics";
import {
  compareSeverity,
  isBlocker,
  onlyBrowser,
  restorePlan,
  routesLoad,
  sameProblems,
  severityOf,
} from "./severity";

const tsc = (message: string): Diagnostic => ({
  source: "tsc",
  path: "app/page.tsx",
  line: 1,
  message,
});
const route: Diagnostic = {
  source: "route",
  path: null,
  line: null,
  message: "GET / returned 500",
};
const browser: Diagnostic = {
  source: "browser",
  path: null,
  line: null,
  message: "/ at phone width: the page scrolls sideways.",
};

describe("severity", () => {
  test.each([
    [tsc("TS2307: Cannot find module '@/components/tasks/TaskApp'."), true],
    [tsc("TS1005: ';' expected."), true],
    [tsc("TS2322: Property 'title' does not exist."), false],
    [route, true],
    [browser, false],
  ])("isBlocker %#", (diagnostic, blocking) => {
    expect(isBlocker(diagnostic)).toBe(blocking);
  });

  test("creating a missing module that reveals type errors is progress", () => {
    const before = severityOf([
      tsc("TS2307: Cannot find module '@/components/tasks/TaskApp'."),
      route,
    ]);
    const after = severityOf([
      tsc("TS2322: a"),
      tsc("TS2322: b"),
      tsc("TS2345: c"),
    ]);
    expect(before).toEqual({ blockers: 2, errors: 0, browser: 0 });
    expect(compareSeverity(after, before)).toBeLessThan(0);
  });

  test("more blockers is worse than any number of type errors", () => {
    expect(
      compareSeverity(
        severityOf([route]),
        severityOf(Array.from({ length: 9 }, () => tsc("TS2322: x"))),
      ),
    ).toBeGreaterThan(0);
  });

  test("routesLoad ignores type errors and browser findings", () => {
    expect(routesLoad([tsc("TS2322: x"), browser])).toBe(true);
    expect(routesLoad([route])).toBe(false);
  });
});

describe("restorePlan", () => {
  test("restores changed files, removes new ones and keeps unchanged ones", () => {
    expect(
      restorePlan({
        snapshot: { "a.tsx": "old", "b.tsx": "same" },
        current: { "a.tsx": "new", "b.tsx": "same", "c.tsx": "added" },
        versionFiles: [],
      }),
    ).toEqual({
      restore: [{ path: "a.tsx", content: "old" }],
      remove: ["c.tsx"],
      restorable: true,
    });
  });

  test("refuses when a saved file is missing from the snapshot", () => {
    expect(
      restorePlan({
        snapshot: {},
        current: { "components/ui/button.tsx": "x" },
        versionFiles: ["components/ui/button.tsx"],
      }).restorable,
    ).toBe(false);
  });
});

describe("problem keys", () => {
  const finding = (seen: string): Diagnostic => ({
    source: "browser",
    path: null,
    line: null,
    message: `/: "Type Ada" didn't work as expected. Expected: Ada. Seen: ${seen}`,
  });

  test("a browser finding is the same problem whatever the browser saw", () => {
    expect(sameProblems([finding("all rows")], [finding("every row")])).toBe(
      true,
    );
    expect(sameProblems([finding("x")], [finding("x"), browser])).toBe(false);
  });

  test("onlyBrowser is true only for a non-empty list of browser findings", () => {
    expect(onlyBrowser([browser, finding("x")])).toBe(true);
    expect(onlyBrowser([browser, route])).toBe(false);
    expect(onlyBrowser([])).toBe(false);
  });
});
