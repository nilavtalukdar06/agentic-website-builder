"use client";

import { useQueryStates } from "nuqs";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  designSearchParams,
  designSections,
  designSectionTitles,
  type DesignSection,
} from "@/lib/search-params/design";

export function DesignNav() {
  const [{ section }, setParams] = useQueryStates(designSearchParams);

  const go = (id: DesignSection) => (event: React.MouseEvent) => {
    event.preventDefault();
    void setParams({ section: id });
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Design system sections"
      className="sticky top-0 z-10 -mx-2 flex items-center gap-1 overflow-x-auto border-b bg-background/95 px-2 py-2 backdrop-blur"
    >
      {designSections.map((id) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={go(id)}
          aria-current={section === id ? "location" : undefined}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "aria-[current=location]:bg-accent",
          )}
        >
          {designSectionTitles[id]}
        </a>
      ))}
      <ThemeToggle
        className="ml-auto"
        onThemeChange={(theme) => void setParams({ theme })}
      />
    </nav>
  );
}
