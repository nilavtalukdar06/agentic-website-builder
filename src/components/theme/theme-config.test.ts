import { describe, expect, test } from "vitest";
import {
  applyTheme,
  parseTheme,
  resolveTheme,
  themeClassNames,
  themeScript,
} from "./theme-config";

describe("theme config", () => {
  test("parseTheme falls back to dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme("sepia")).toBe("dark");
  });

  test("resolveTheme follows the system only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  test("applyTheme never uses the scoped .light class on the root", () => {
    const root = document.createElement("html");
    applyTheme(root, "light");
    expect(root.className).toBe(themeClassNames.light);
    expect(root.classList.contains("light")).toBe(false);
    applyTheme(root, "dark");
    expect(root.className).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  test("the inline script applies the stored theme", () => {
    localStorage.setItem("vibe-theme", "light");
    document.documentElement.className = "dark";
    new Function(themeScript)();
    expect(document.documentElement.className).toBe("theme-light");
    localStorage.clear();
  });
});
