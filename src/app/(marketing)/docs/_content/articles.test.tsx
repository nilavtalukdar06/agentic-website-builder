import { describe, expect, test } from "vitest";
import { privacySections } from "../../privacy/_content";
import { termsSections } from "../../terms/_content";
import { docArticles, getAdjacentArticles, getDocArticle } from "./articles";

describe("docs content", () => {
  test("slugs are unique and URL safe", () => {
    const slugs = docArticles.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test.each(docArticles.map((article) => [article.slug, article] as const))(
    "%s has unique section ids",
    (_, article) => {
      const ids = article.sections.map((section) => section.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  test("getDocArticle returns undefined for unknown slugs", () => {
    expect(getDocArticle("getting-started")?.title).toBe("Getting started");
    expect(getDocArticle("nope")).toBeUndefined();
  });

  test("getAdjacentArticles walks the list", () => {
    expect(getAdjacentArticles(docArticles[0].slug)).toEqual({
      previous: null,
      next: docArticles[1],
    });
    const last = docArticles[docArticles.length - 1];
    expect(getAdjacentArticles(last.slug).next).toBeNull();
    expect(getAdjacentArticles("nope")).toEqual({ previous: null, next: null });
  });

  test("links into legal pages point at real section ids", () => {
    expect(termsSections.map((section) => section.id)).toEqual(
      expect.arrayContaining(["content", "credits"]),
    );
    expect(privacySections.map((section) => section.id)).toEqual(
      expect.arrayContaining(["sharing", "collect"]),
    );
  });

  test("anchors linked from other articles exist", () => {
    expect(
      getDocArticle("getting-started")?.sections.map((section) => section.id),
    ).toEqual(expect.arrayContaining(["model", "images", "voice", "build"]));
  });

  test("legal section ids are unique", () => {
    for (const sections of [termsSections, privacySections]) {
      const ids = sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
