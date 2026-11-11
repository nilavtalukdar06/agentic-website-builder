import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { curatedModels } from "@/lib/ai/models";
import { ModelLogo, modelLogoKey, scopeLogoIds } from "./model-logo";
import { modelLogoData } from "./model-logos.generated";

describe("modelLogoKey", () => {
  test.each([
    ["anthropic/claude-sonnet-5.5", "claude"],
    ["openai/gpt-6.1-sol", "openai"],
    ["openai/gpt-5.3-codex", "codex"],
    ["openai/gpt-5.1-codex-mini", "codex"],
    ["google/gemini-4-carbon", "gemini"],
    ["moonshotai/kimi-k2.7-code", "kimi"],
    ["zai/glm-5.3", "zai"],
    ["deepseek/deepseek-v4.1-flash", "deepseek"],
    ["alibaba/qwen3.8-max", "alibaba"],
    ["mistral/mistral-large-4", "mistral"],
  ])("%s uses the %s logo", (id, key) => {
    expect(modelLogoKey(id)).toBe(key);
  });

  test("Codex models get the Codex logo, other OpenAI models the OpenAI one", () => {
    expect(modelLogoKey("openai/gpt-5.1-codex")).toBe("codex");
    expect(modelLogoKey("openai/gpt-5.5")).toBe("openai");
  });

  test("a provider with no logo has none", () => {
    expect(modelLogoKey("acme/codeless")).toBeNull();
    expect(modelLogoKey("constructor/model")).toBeNull();
    expect(modelLogoKey("")).toBeNull();
  });

  test("every curated model has a logo", () => {
    const missing = curatedModels
      .map((model) => model.id)
      .filter((id) => modelLogoKey(id) === null);
    expect(missing).toEqual([]);
  });
});

describe("ModelLogo", () => {
  test.each(Object.keys(modelLogoData))("%s renders an inline svg", (key) => {
    const ids = {
      claude: "anthropic/claude-sonnet-5.5",
      codex: "openai/gpt-5.3-codex",
      openai: "openai/gpt-6.1-sol",
      gemini: "google/gemini-4-carbon",
      kimi: "moonshotai/kimi-k3",
      zai: "zai/glm-5.3",
      deepseek: "deepseek/deepseek-v4.1-flash",
      alibaba: "alibaba/qwen3.8-max",
      mistral: "mistral/mistral-large-4",
    } as const;
    const { container } = render(
      <ModelLogo modelId={ids[key as keyof typeof ids]} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-logo", key);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelector("path")).not.toBeNull();
  });

  test("uses a generic icon for an unknown provider", () => {
    const { container } = render(
      <ModelLogo modelId="acme/model" className="size-6" />,
    );
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("data-logo", "generic");
    expect(icon).toHaveClass("size-6");
  });

  test("gradient ids are unique per logo, so repeated logos never collide", () => {
    const { container } = render(
      <>
        <ModelLogo modelId="google/gemini-4-carbon" />
        <ModelLogo modelId="google/gemini-3.8-flash" />
        <ModelLogo modelId="openai/gpt-5.3-codex" />
        <ModelLogo modelId="openai/gpt-5.1-codex-mini" />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length);

    for (const reference of container.querySelectorAll('[fill^="url(#"]')) {
      const id = /url\(#([^)]+)\)/.exec(
        reference.getAttribute("fill") ?? "",
      )?.[1];
      expect(container.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    }
  });
});

describe("scopeLogoIds", () => {
  test("rewrites both the definition and every reference", () => {
    expect(
      scopeLogoIds(
        '<path fill="url(#g)"/><linearGradient id="g"/>',
        ["g"],
        "s1",
      ),
    ).toBe('<path fill="url(#g-s1)"/><linearGradient id="g-s1"/>');
  });

  test("leaves logos without ids untouched", () => {
    expect(scopeLogoIds("<path/>", [], "s1")).toBe("<path/>");
  });
});

describe("generated logos", () => {
  test("are plain marks: no scripts, styles, images or external references", () => {
    for (const logo of Object.values(modelLogoData)) {
      expect(logo.body).not.toMatch(
        /<style|<script|<foreignObject|<image|<use|\shref=|\son[a-z]+=/i,
      );
    }
  });

  test("every url() reference points at an id the logo defines", () => {
    for (const logo of Object.values(modelLogoData)) {
      const references = [...logo.body.matchAll(/url\(#([^)]+)\)/g)].map(
        (found) => found[1],
      );
      for (const reference of references) {
        expect(logo.ids).toContain(reference);
      }
    }
  });
});
