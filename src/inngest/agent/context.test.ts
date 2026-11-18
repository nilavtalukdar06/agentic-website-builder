import { describe, expect, test } from "vitest";
import { buildContext, preloadFiles } from "./context";

describe("preloadFiles", () => {
  test("keeps target order, skips missing, binary and oversized files, and respects the budget", () => {
    const files = {
      "a.tsx": "a".repeat(100),
      "b.tsx": "b".repeat(200),
      "img.png": "data:image/png;base64,AAA",
      "huge.tsx": "h".repeat(20_000),
    };
    expect(
      preloadFiles(
        files,
        ["b.tsx", "missing.tsx", "img.png", "huge.tsx", "a.tsx"],
        250,
      ),
    ).toEqual([{ path: "b.tsx", content: "b".repeat(200) }]);
  });
});

describe("buildContext", () => {
  test("puts design notes, repo map and preloaded files in a fixed order with an intent hint", () => {
    const context = buildContext({
      intent: "edit",
      designNotes: "Fonts: Inter",
      repoMap: "Routes: /",
      preloaded: [{ path: "app/page.tsx", content: "export default 1" }],
    });
    const order = [
      "## Design notes",
      "## Repo map",
      "## Current contents of the files you most likely need",
      '<untrusted source="file:app/page.tsx">',
      "</project_context>",
      "make the change with editFile in your first reply",
    ].map((marker) => context.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("is stable for the same input", () => {
    const input = { intent: "fix" as const, designNotes: "", repoMap: "x" };
    expect(buildContext(input)).toBe(buildContext(input));
  });

  test("skips empty sections", () => {
    expect(
      buildContext({ intent: "create", designNotes: "", repoMap: "" }),
    ).toBe(
      "<project_context>\n</project_context>\nThis is a new site. Build the whole request in as few replies as you can.",
    );
  });
});
