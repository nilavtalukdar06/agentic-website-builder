import { describe, expect, test } from "vitest";
import {
  mentionsSite,
  searchQuery,
  searchRecord,
  uniqueSources,
} from "./search";

describe("searchRecord", () => {
  test("takes the objective and the result titles and URLs", () => {
    expect(
      searchRecord(
        { objective: "Stripe pricing page layout", search_queries: ["x"] },
        {
          search_id: "s1",
          results: [
            {
              url: "https://stripe.com/pricing",
              title: "Pricing",
              excerpts: [],
            },
            { url: "https://stripe.com/pricing", title: "Dup", excerpts: [] },
            { url: "https://example.com", title: null, excerpts: [] },
            { url: "javascript:alert(1)", title: "bad", excerpts: [] },
          ],
        },
      ),
    ).toEqual({
      query: "Stripe pricing page layout",
      sources: [
        { url: "https://stripe.com/pricing", title: "Pricing" },
        { url: "https://example.com", title: "https://example.com" },
      ],
    });
  });

  test("falls back to the keyword queries and survives tool errors", () => {
    expect(searchQuery({ search_queries: ["acme pricing", "acme logo"] })).toBe(
      "acme pricing; acme logo",
    );
    expect(searchRecord(undefined, { type: "error", message: "x" })).toEqual({
      query: "",
      sources: [],
    });
  });

  test("dedupes sources across searches", () => {
    const a = { url: "https://a.com", title: "A" };
    expect(
      uniqueSources([
        { query: "1", sources: [a] },
        { query: "2", sources: [a, { url: "https://b.com", title: "B" }] },
      ]),
    ).toHaveLength(2);
  });
});

describe("mentionsSite", () => {
  test.each([
    ["like stripe.com/pricing", true],
    ["see https://example.org", true],
    ["Make the heading bigger.", false],
    ["Use Next.js and React", false],
  ])("mentionsSite(%j) = %s", (prompt, expected) => {
    expect(mentionsSite(prompt)).toBe(expected);
  });
});
