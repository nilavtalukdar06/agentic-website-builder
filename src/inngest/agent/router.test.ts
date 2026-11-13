import { describe, expect, test, vi } from "vitest";
import {
  mentionsSite,
  type RouteInput,
  routeAgents,
  routerPrompt,
  shouldReview,
} from "./router";

const existing = (prompt: string): RouteInput => ({
  prompt,
  hasVersion: true,
  attachments: 0,
  files: ["app/page.tsx", "components/hero.tsx"],
});

const fresh = (prompt: string): RouteInput => ({
  prompt,
  hasVersion: false,
  attachments: 0,
  files: [],
});

describe("fast mode", () => {
  test("any message goes to the builder alone, with no model call", async () => {
    const classify = vi.fn();
    const route = await routeAgents(
      {
        ...fresh("A site for Acme, like stripe.com/pricing"),
        attachments: 2,
        mode: "fast",
      },
      classify,
    );
    expect(route).toEqual({
      agents: ["builder"],
      reason: "Fast mode: the builder works alone.",
      decidedBy: "fast",
    });
    expect(classify).not.toHaveBeenCalled();
  });

  test("standard mode still routes a new site through the team", async () => {
    const classify = vi.fn().mockResolvedValue({
      agents: ["builder"],
      reason: "r",
    });
    const route = await routeAgents(
      { ...fresh("A landing page for Ember & Oak"), mode: "standard" },
      classify,
    );
    expect(route.agents).toEqual(["designer", "builder"]);
    expect(classify).toHaveBeenCalledOnce();
  });

  test("fast mode skips the reviewer", () => {
    expect(shouldReview({ hasVersion: false, written: 12, mode: "fast" })).toBe(
      false,
    );
    expect(
      shouldReview({ hasVersion: false, written: 12, mode: "standard" }),
    ).toBe(true);
  });
});

describe("routeAgents", () => {
  test('"Make the heading bigger" → Builder, decided in code', async () => {
    const classify = vi.fn();
    const route = await routeAgents(
      existing("Make the heading bigger"),
      classify,
    );
    expect(route).toMatchObject({ agents: ["builder"], decidedBy: "rules" });
    expect(classify).not.toHaveBeenCalled();
    expect(shouldReview({ hasVersion: true, written: 1 })).toBe(false);
  });

  test('"Add a newsletter signup" → Builder, plus the Reviewer if it wrote 5+ files', async () => {
    const classify = vi.fn();
    const route = await routeAgents(
      existing("Add a newsletter signup"),
      classify,
    );
    expect(route.agents).toEqual(["builder"]);
    expect(classify).not.toHaveBeenCalled();
    expect(shouldReview({ hasVersion: true, written: 4 })).toBe(false);
    expect(shouldReview({ hasVersion: true, written: 5 })).toBe(true);
  });

  test('"A landing page for Ember & Oak" → Designer → Builder → Reviewer', async () => {
    const classify = vi.fn().mockResolvedValue({
      agents: ["designer", "builder"],
      reason: "A new site for a fictional brand.",
    });
    const route = await routeAgents(
      fresh("A landing page for Ember & Oak"),
      classify,
    );
    expect(route).toMatchObject({
      agents: ["designer", "builder"],
      decidedBy: "model",
    });
    expect(shouldReview({ hasVersion: false, written: 3 })).toBe(true);
  });

  test('"A site for Acme, like stripe.com/pricing" → Researcher → Designer → Builder → Reviewer', async () => {
    const classify = vi
      .fn()
      .mockResolvedValue({ agents: ["builder"], reason: "x" });
    const route = await routeAgents(
      fresh("A site for Acme, like stripe.com/pricing"),
      classify,
    );
    expect(route.agents).toEqual(["researcher", "designer", "builder"]);
    expect(shouldReview({ hasVersion: false, written: 8 })).toBe(true);
  });

  test("puts agents in order and always includes the Builder", async () => {
    const route = await routeAgents(
      existing(
        "Rework the whole site so it feels like a premium editorial magazine, with new sections for stories, a newsletter and a refreshed footer and navigation that work well on phones and tablets",
      ),
      vi.fn().mockResolvedValue({
        agents: ["designer", "researcher"],
        reason: "x",
      }),
    );
    expect(route.agents).toEqual(["researcher", "designer", "builder"]);
  });

  test("images on an existing site bring in the Designer", async () => {
    const route = await routeAgents(
      { ...existing("Match this"), attachments: 1 },
      vi.fn().mockResolvedValue({ agents: ["builder"], reason: "x" }),
    );
    expect(route.agents).toEqual(["designer", "builder"]);
  });

  test("falls back to the Builder alone when the router fails", async () => {
    const route = await routeAgents(
      fresh("A portfolio"),
      vi.fn().mockRejectedValue(new Error("429")),
    );
    expect(route).toMatchObject({
      agents: ["builder"],
      decidedBy: "fallback",
    });
    const invalid = await routeAgents(
      fresh("A portfolio"),
      vi.fn().mockResolvedValue({ agents: ["hacker"] }),
    );
    expect(invalid.decidedBy).toBe("fallback");
  });
});

describe("helpers", () => {
  test.each([
    ["like stripe.com/pricing", true],
    ["see https://example.org", true],
    ["Make the heading bigger.", false],
    ["Use Next.js and React", false],
  ])("mentionsSite(%j) = %s", (prompt, expected) => {
    expect(mentionsSite(prompt)).toBe(expected);
  });

  test("the router prompt holds the message, project state and files", () => {
    const prompt = routerPrompt(existing("Add a footer"));
    expect(prompt).toContain("Add a footer");
    expect(prompt).toContain("has a built site");
    expect(prompt).toContain("components/hero.tsx");
  });

  test("never reviews a run that wrote nothing", () => {
    expect(shouldReview({ hasVersion: false, written: 0 })).toBe(false);
  });
});
