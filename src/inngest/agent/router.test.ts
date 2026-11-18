import { describe, expect, test } from "vitest";
import { guessTargets, knownTargets, routeIntent } from "./router";

const project = { hasVersion: true };

describe("routeIntent", () => {
  test("the first message of a project is always a create", () => {
    expect(routeIntent("make the button blue", { hasVersion: false })).toEqual({
      intent: "create",
      confident: true,
    });
  });

  test.each([
    ["Make the hero button blue", "edit", true],
    ["change the headline to 'Coffee for night owls'", "edit", true],
    ["Remove the testimonials section", "edit", true],
    ["Add a pricing page", "large-change", true],
    ["Redesign the whole site in a brutalist style", "large-change", true],
    ["Add a blog with a list and detail pages", "large-change", true],
    ["The contact form is broken", "fix", true],
    [
      "TypeError: Cannot read properties of undefined (reading 'map')",
      "fix",
      true,
    ],
    ["Why is the footer grey?", "question", false],
    ["What fonts does the site use?", "question", false],
    ["hmm", "edit", false],
  ])("%j → %s", (message, intent, confident) => {
    expect(routeIntent(message, project)).toEqual({ intent, confident });
  });

  test("a pasted stack trace is a confident fix", () => {
    const trace = "Something failed\n    at Hero (components/hero.tsx:12:5)";
    expect(routeIntent(trace, project)).toEqual({
      intent: "fix",
      confident: true,
    });
  });

  test("a question that asks for a change is not a question", () => {
    expect(routeIntent("Can you make the logo bigger?", project).intent).toBe(
      "edit",
    );
  });
});

describe("guessTargets", () => {
  const paths = [
    "app/page.tsx",
    "app/about/page.tsx",
    "app/globals.css",
    "app/layout.tsx",
    "components/hero.tsx",
    "components/site-footer.tsx",
    "components/ui/button.tsx",
    "lib/data.ts",
  ];

  test("matches words in the message to file and route names", () => {
    expect(guessTargets("make the footer links bigger", paths)[0]).toBe(
      "components/site-footer.tsx",
    );
    expect(guessTargets("update the about page copy", paths)).toContain(
      "app/about/page.tsx",
    );
  });

  test("colour and theme changes target the tokens", () => {
    expect(guessTargets("change the primary colour to green", paths)[0]).toBe(
      "app/globals.css",
    );
  });

  test("never targets components/ui", () => {
    expect(guessTargets("make every button rounded", paths)).not.toContain(
      "components/ui/button.tsx",
    );
  });
});

describe("knownTargets", () => {
  test("drops unknown paths and duplicates, normalising prefixes", () => {
    expect(
      knownTargets(
        ["./app/page.tsx", "/app/page.tsx", "invented.tsx", "lib/data.ts"],
        ["app/page.tsx", "lib/data.ts"],
      ),
    ).toEqual(["app/page.tsx", "lib/data.ts"]);
  });
});
