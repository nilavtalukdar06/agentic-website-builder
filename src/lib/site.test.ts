import { describe, expect, test } from "vitest";
import manifest from "@/app/manifest";
import robots from "@/app/robots";
import { getSiteUrl, siteConfig } from "./site";

describe("site metadata", () => {
  test("getSiteUrl uses the env value and falls back to localhost", () => {
    expect(getSiteUrl("https://vibe.example").origin).toBe(
      "https://vibe.example",
    );
    expect(getSiteUrl("").origin).toBe("http://localhost:3000");
    expect(getSiteUrl("not a url").origin).toBe("http://localhost:3000");
  });

  test("manifest uses the brand name and icons", () => {
    const result = manifest();
    expect(result.short_name).toBe(siteConfig.shortName);
    expect(result.icons?.map((icon) => icon.src)).toEqual([
      "/icon.svg",
      "/apple-icon",
    ]);
  });

  test("robots keeps private and internal routes out of the index", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.disallow).toEqual(["/api/", "/p/", "/design", "/dev"]);
  });
});
