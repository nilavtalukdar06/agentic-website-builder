export const themes = ["light", "dark", "system"] as const;

export type Theme = (typeof themes)[number];
export type ResolvedTheme = Exclude<Theme, "system">;

export const defaultTheme: Theme = "dark";
export const themeStorageKey = "vibe-theme";

/* `.light` is reserved for scoped light panels, so the root uses `theme-light`. */
export const themeClassNames: Record<ResolvedTheme, string> = {
  light: "theme-light",
  dark: "dark",
};

export const prefersDarkQuery = "(prefers-color-scheme: dark)";

export function parseTheme(value: unknown): Theme {
  return themes.includes(value as Theme) ? (value as Theme) : defaultTheme;
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean) {
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return theme;
}

export function applyTheme(root: HTMLElement, resolved: ResolvedTheme) {
  root.classList.remove(...Object.values(themeClassNames));
  root.classList.add(themeClassNames[resolved]);
  root.style.colorScheme = resolved;
}

export const themeScript = `(function(){try{var k=${JSON.stringify(
  themeStorageKey,
)},t=localStorage.getItem(k),v=${JSON.stringify(themes)};if(v.indexOf(t)<0)t=${JSON.stringify(
  defaultTheme,
)};var d=t==="dark"||(t==="system"&&matchMedia(${JSON.stringify(
  prefersDarkQuery,
)}).matches),c=${JSON.stringify(themeClassNames)},r=document.documentElement;r.classList.remove(c.light,c.dark);r.classList.add(d?c.dark:c.light);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
