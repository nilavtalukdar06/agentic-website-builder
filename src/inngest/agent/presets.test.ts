import { describe, expect, test } from "vitest";
import { applyPreset, presetCatalog, presetNames, presets } from "./presets";

const css = `@import "tailwindcss";

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --primary: oklch(0.922 0 0);
}
`;

describe("applyPreset", () => {
  test("sets the preset's tokens in :root and .dark and leaves the rest", () => {
    const themed = applyPreset(css, "ocean");
    expect(themed).toContain(`--primary: ${presets.ocean.light.primary};`);
    expect(themed).toContain(`--radius: ${presets.ocean.radius};`);
    expect(themed).toContain("--background: oklch(1 0 0);");
    const dark = themed.slice(themed.indexOf(".dark"));
    expect(dark).toContain(`--primary: ${presets.ocean.dark.primary};`);
    expect(dark).toContain("--background: oklch(0.145 0 0);");
  });

  test("adds tokens the stylesheet doesn't have yet", () => {
    const themed = applyPreset(css, "forest");
    expect(themed).toContain(`--chart-1: ${presets.forest.light["chart-1"]};`);
  });

  test("is idempotent", () => {
    const once = applyPreset(css, "violet");
    expect(applyPreset(once, "violet")).toBe(once);
  });

  test("leaves a stylesheet without theme blocks unchanged", () => {
    expect(applyPreset("body { color: red; }", "rose")).toBe(
      "body { color: red; }",
    );
  });
});

describe("presetCatalog", () => {
  test("describes every preset", () => {
    const catalog = presetCatalog();
    for (const name of presetNames) expect(catalog).toContain(`- ${name}: `);
  });
});
