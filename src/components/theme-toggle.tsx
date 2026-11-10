"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";

export type ThemeToggleProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "children"
> & {
  onThemeChange?: (theme: "light" | "dark") => void;
};

export function ThemeToggle({
  onThemeChange,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    if (onThemeChange) onThemeChange(next);
    else setTheme(next);
  };

  return (
    <Button
      variant={variant}
      size={size}
      aria-label="Toggle theme"
      onClick={toggle}
      {...props}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
