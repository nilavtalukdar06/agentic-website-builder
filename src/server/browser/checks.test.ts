import { describe, expect, test } from "vitest";
import {
  interactionDiagnostic,
  pageReportToDiagnostics,
  pageSummary,
  parseVerdict,
  verdictInstruction,
} from "./checks";
import { cleanReport } from "./fake";
import { assertSameOrigin, OriginError, previewTarget } from "./types";

const preview = "https://3000-abc.e2b.app";

describe("pageReportToDiagnostics", () => {
  test("a clean page has no findings", () => {
    const found = pageReportToDiagnostics(cleanReport(preview), "/", "desktop");
    expect(found).toEqual([]);
    expect(pageSummary(found)).toBe(
      "No errors, nothing scrolls sideways, images load",
    );
  });

  test("reports errors, overflow, broken images and blank pages with the viewport", () => {
    const found = pageReportToDiagnostics(
      {
        ...cleanReport(preview),
        errors: [
          "TypeError: items.map is not a function",
          "Download the React DevTools for a better development experience",
          "[HMR] connected",
          "TypeError: items.map is not a function",
        ],
        overflow: {
          scrollWidth: 520,
          innerWidth: 390,
          offender: "div.grid.grid-cols-3 (520px)",
        },
        brokenImages: ["https://3000-abc.e2b.app/hero.png"],
        emptyMain: true,
      },
      "/pricing",
      "phone",
    );
    expect(found.map((item) => item.source)).toEqual([
      "browser",
      "browser",
      "browser",
      "browser",
    ]);
    expect(found[0].message).toBe(
      "/pricing at phone width (390px): runtime error: TypeError: items.map is not a function",
    );
    expect(found[1].message).toContain(
      "scrolls sideways (content is 520px wide in a 390px window); widest element: div.grid.grid-cols-3 (520px)",
    );
    expect(found[2].message).toContain("an image failed to load");
    expect(found[3].message).toContain("renders no visible content");
  });

  test("the error overlay is reported and hides the blank-page finding", () => {
    const found = pageReportToDiagnostics(
      { ...cleanReport(preview), overlay: true, emptyMain: true },
      "/",
      "desktop",
    );
    expect(found.map((item) => item.message)).toEqual([
      "/ at desktop width (1280px): the Next.js error overlay is showing.",
    ]);
  });

  test("caps runtime errors per page", () => {
    const found = pageReportToDiagnostics(
      { ...cleanReport(preview), errors: ["a1", "a2", "a3", "a4", "a5"] },
      "/",
      "desktop",
    );
    expect(found).toHaveLength(3);
  });
});

describe("interactionDiagnostic", () => {
  test("says what was tried, expected and seen", () => {
    expect(
      interactionDiagnostic(
        "/",
        "Add a task",
        "The task is listed",
        "the list is empty",
      ).message,
    ).toBe(
      '/: "Add a task" didn\'t work as expected. Expected: The task is listed. Seen: the list is empty',
    );
  });
});

describe("parseVerdict", () => {
  test.each([
    ["PASS: the cart shows 1 item", "passed", "the cart shows 1 item"],
    ["FAIL: the list is still empty", "failed", "the list is still empty"],
    ["**pass** - looks right", "passed", "looks right"],
    [{ extraction: "FAIL. Nothing happened" }, "failed", "Nothing happened"],
    ["PASS", "passed", "as expected"],
    [
      "UNSURE: the highlight is only a colour",
      "untestable",
      "the highlight is only a colour",
    ],
    ["unsure", "untestable", "the page can't show this"],
  ])("%j", (input, outcome, detail) => {
    expect(parseVerdict(input)).toEqual({ outcome, detail });
  });

  test("an answer without a verdict can't count as a failure", () => {
    expect(parseVerdict("I am not sure")).toEqual({
      outcome: "untestable",
      detail: "I am not sure",
    });
    expect(parseVerdict(null)).toEqual({
      outcome: "untestable",
      detail: "the result couldn't be read",
    });
  });

  test("the verdict instruction allows UNSURE for styling", () => {
    expect(verdictInstruction("The nav item is highlighted")).toContain(
      "answer UNSURE",
    );
  });
});

describe("origin lock", () => {
  test("builds URLs only on the preview's origin", () => {
    expect(previewTarget(preview, "/pricing")).toBe(`${preview}/pricing`);
    expect(previewTarget(preview, "pricing?x=1")).toBe(
      `${preview}/pricing?x=1`,
    );
    expect(previewTarget(preview, "//evil.example/steal")).toBe(
      `${preview}/evil.example/steal`,
    );
  });

  test("refuses a page on another origin", () => {
    expect(() => assertSameOrigin(preview, `${preview}/about`)).not.toThrow();
    expect(() => assertSameOrigin(preview, "https://evil.example/")).toThrow(
      OriginError,
    );
    expect(() => assertSameOrigin(preview, "not a url")).toThrow(OriginError);
  });
});
