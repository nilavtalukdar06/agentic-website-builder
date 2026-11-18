import { describe, expect, test } from "vitest";
import { applyEdits } from "./edits";

const file = [
  "export function Hero() {",
  "  return (",
  '    <section className="py-20">',
  '      <h1 className="text-4xl">Fresh coffee</h1>',
  '      <Button variant="default">Shop</Button>',
  "    </section>",
  "  );",
  "}",
  "",
].join("\n");

describe("applyEdits", () => {
  test("replaces text that matches exactly once", () => {
    const result = applyEdits(file, [
      { search: "Fresh coffee", replace: "Small-batch coffee" },
    ]);
    expect(result).toEqual({
      ok: true,
      content: file.replace("Fresh coffee", "Small-batch coffee"),
      replacements: 1,
    });
  });

  test("applies blocks in order, each to the result of the one before", () => {
    const result = applyEdits(file, [
      { search: "py-20", replace: "py-24" },
      { search: 'className="py-24"', replace: 'className="py-24 bg-muted"' },
    ]);
    expect(result.ok && result.content).toContain('className="py-24 bg-muted"');
  });

  test("refuses ambiguous text and names the lines", () => {
    const result = applyEdits(file, [{ search: "className", replace: "x" }]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(
      /appears 2 times \(lines 3, 4\)/,
    );
  });

  test("matches when only indentation differs", () => {
    const result = applyEdits(file, [
      {
        search:
          '<h1 className="text-4xl">Fresh coffee</h1>\n<Button variant="default">Shop</Button>',
        replace:
          '      <h1 className="text-5xl">Fresh coffee</h1>\n      <Button>Shop now</Button>',
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.content).toContain(
      "      <Button>Shop now</Button>\n    </section>",
    );
  });

  test("keeps CRLF line endings", () => {
    const crlf = file.replace(/\n/g, "\r\n");
    const result = applyEdits(crlf, [
      { search: "Fresh coffee</h1>\n", replace: "Hot coffee</h1>\n" },
    ]);
    expect(result.ok && result.content).toBe(
      crlf.replace("Fresh coffee", "Hot coffee"),
    );
  });

  test("applies nothing when any block fails", () => {
    const result = applyEdits(file, [
      { search: "py-20", replace: "py-24" },
      { search: '<h2 className="text-4xl">Fresh coffee</h2>', replace: "x" },
    ]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Edit 2");
    expect(!result.ok && result.error).toContain("No edits were applied");
    expect(!result.ok && result.error).toContain(
      '4|       <h1 className="text-4xl">Fresh coffee</h1>',
    );
  });

  test("a later block can't match text an earlier block replaced", () => {
    const result = applyEdits(file, [
      { search: "Shop</Button>", replace: "Buy</Button>" },
      { search: "Shop</Button>", replace: "Order</Button>" },
    ]);
    expect(result.ok).toBe(false);
  });

  test("rejects an empty search", () => {
    const result = applyEdits(file, [{ search: "", replace: "x" }]);
    expect(!result.ok && result.error).toContain("search is empty");
  });
});
