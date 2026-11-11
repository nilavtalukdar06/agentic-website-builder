import { describe, expect, test } from "vitest";
import { loadProjectsSearchParams } from "./projects-loader";

describe("projects search params", () => {
  test("defaults", () => {
    expect(loadProjectsSearchParams("")).toEqual({
      q: "",
      filter: "all",
      sort: "edited",
    });
  });

  test("parses known values", () => {
    expect(
      loadProjectsSearchParams("?q=coffee&filter=github&sort=name"),
    ).toEqual({ q: "coffee", filter: "github", sort: "name" });
  });

  test("falls back on unknown filter and sort", () => {
    expect(loadProjectsSearchParams("?filter=x&sort=y")).toMatchObject({
      filter: "all",
      sort: "edited",
    });
  });
});
