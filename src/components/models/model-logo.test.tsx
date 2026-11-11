import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { curatedModels } from "@/lib/ai/models";
import { hasModelLogo, ModelLogo } from "./model-logo";
import { modelLogoData } from "./model-logos.generated";

describe("ModelLogo", () => {
  test("every provider in the curated list has a logo", () => {
    const providers = new Set(
      curatedModels.map((model) => model.id.split("/")[0]),
    );
    const missing = [...providers].filter(
      (provider) => !hasModelLogo(provider),
    );
    expect(missing).toEqual([]);
  });

  test.each(Object.keys(modelLogoData))(
    "%s renders a themed svg",
    (provider) => {
      const { container } = render(<ModelLogo provider={provider} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("data-provider", provider);
      expect(svg).toHaveAttribute("fill", "currentColor");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg?.querySelector("path")).not.toBeNull();
    },
  );

  test("uses a generic icon for an unknown provider", () => {
    const { container } = render(
      <ModelLogo provider="acme" className="size-6" />,
    );
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("data-provider", "generic");
    expect(icon).toHaveClass("size-6");
  });

  test("the generated logos are plain single-color marks", () => {
    for (const logo of Object.values(modelLogoData)) {
      expect(logo.body).not.toMatch(/<defs|<style|gradient|\sid=|url\(/i);
    }
  });
});
