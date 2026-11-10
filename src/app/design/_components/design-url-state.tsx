"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { useQueryStates } from "nuqs";
import { designSearchParams } from "@/lib/search-params/design";

export function DesignUrlState() {
  const [{ section, theme }] = useQueryStates(designSearchParams);
  const { setTheme } = useTheme();
  const scrolled = useRef(false);

  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);

  useEffect(() => {
    if (!section || scrolled.current) return;
    scrolled.current = true;
    document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [section]);

  return null;
}
