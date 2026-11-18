import { describe, expect, test } from "vitest";
import {
  cleanProjectName,
  projectNameFromPrompt,
  slugFromName,
  withSlugSuffix,
} from "./project-name";

describe("projectNameFromPrompt", () => {
  test.each([
    [
      "A landing page for my coffee roastery with a shop section…",
      "Landing page for my coffee roastery",
    ],
    ["Build me a portfolio. Dark theme, serif.", "Portfolio"],
    ["please create an admin dashboard!", "Admin dashboard"],
    ["  event page\nwith a schedule", "Event page"],
    ["The Ember & Oak site", "Ember & Oak site"],
    [
      "Admin dashboard with a sidebar, stat cards, a revenue chart and a users table",
      "Admin dashboard",
    ],
    ["A todo app, dark mode, with local storage", "Todo app"],
    ["Pricing", "Pricing"],
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

describe("cleanProjectName", () => {
  test.each([
    ["  “Ember & Oak”  ", "Ember & Oak"],
    ["task flow.", "Task flow"],
    [
      "Admin Dashboard — a modern admin panel",
      "Admin Dashboard — a modern admin panel",
    ],
  ])("%s → %s", (value, name) => {
    expect(cleanProjectName(value)).toBe(name);
  });

  test("caps the length on a word boundary", () => {
    const name = cleanProjectName("word ".repeat(40));
    expect(name!.length).toBeLessThanOrEqual(48);
  });

  test("rejects empty or one-character names", () => {
    expect(cleanProjectName("   ")).toBeNull();
    expect(cleanProjectName("...")).toBeNull();
    expect(cleanProjectName("A")).toBeNull();
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
