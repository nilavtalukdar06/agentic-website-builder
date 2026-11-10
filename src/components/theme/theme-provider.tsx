"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  applyTheme,
  defaultTheme,
  parseTheme,
  prefersDarkQuery,
  resolveTheme,
  themeStorageKey,
  type ResolvedTheme,
  type Theme,
} from "./theme-config";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const themeChangeEvent = "vibe-theme-change";

function subscribeTheme(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === themeStorageKey) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(themeChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(themeChangeEvent, onChange);
  };
}

function readTheme() {
  try {
    return parseTheme(localStorage.getItem(themeStorageKey));
  } catch {
    return defaultTheme;
  }
}

function subscribeSystem(onChange: () => void) {
  const mql = window.matchMedia(prefersDarkQuery);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readTheme,
    () => defaultTheme,
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(prefersDarkQuery).matches,
    () => true,
  );
  const resolvedTheme = resolveTheme(theme, systemPrefersDark);

  useEffect(() => {
    applyTheme(document.documentElement, resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {}
    window.dispatchEvent(new Event(themeChangeEvent));
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
