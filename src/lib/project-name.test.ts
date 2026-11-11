import { describe, expect, test } from "vitest";
import {
  projectNameFromPrompt,
  slugFromName,
  withSlugSuffix,
} from "./project-name";

describe("projectNameFromPrompt", () => {
  test.each([
    [
      "A landing page for my coffee roastery with a shop section…",
      "Landing page for my coffee roastery with a shop",
    ],
    ["Build me a portfolio. Dark theme, serif.", "Portfolio"],
    ["please create an admin dashboard!", "Admin dashboard"],
    ["  event page\nwith a schedule", "Event page"],
    ["The Ember & Oak site", "Ember & Oak site"],
  ])("%s → %s", (prompt, name) => {
    expect(projectNameFromPrompt(prompt)).toBe(name);
  });

  test("keeps the sentence when only filler remains", () => {
    expect(projectNameFromPrompt("Build me a")).toBe("Build me a");
  });

  test("caps the length on a word boundary", () => {
    const name = projectNameFromPrompt("word ".repeat(40));
    expect(name.length).toBeLessThanOrEqual(48);
    expect(name.endsWith(" ")).toBe(false);
  });

  test("falls back when the prompt has no words", () => {
    expect(projectNameFromPrompt("...")).toBe("Untitled project");
  });
});

describe("slugFromName", () => {
  test("transliterates and lowercases", () => {
    expect(slugFromName("Ember & Oak Roasters")).toBe("ember-and-oak-roasters");
    expect(slugFromName("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  test("is at most 40 characters without a trailing dash", () => {
    const slug = slugFromName(
      "Landing page for my coffee roastery with a shop",
    );
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  test("falls back for names with no slug characters", () => {
    expect(slugFromName("🎉🎉")).toBe("project");
  });

  test("adds a suffix", () => {
    expect(withSlugSuffix("demo", "a1b2")).toBe("demo-a1b2");
  });
});
