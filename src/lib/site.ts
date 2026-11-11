import { env } from "@/config/env";
import { brandHex } from "@/components/brand/logo-paths";

export function getSiteUrl(value = env.NEXT_PUBLIC_APP_URL) {
  try {
    return new URL(value || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const siteConfig = {
  name: "Vibe",
  shortName: "Vibe",
  title: "Vibe — AI website builder",
  description:
    "Describe a website. Vibe writes the Next.js code in a live sandbox while you watch, then you preview it, download it or export it to GitHub.",
  keywords: [
    "AI website builder",
    "Next.js",
    "code generation",
    "live sandbox",
    "export to GitHub",
    "Tailwind CSS",
    "shadcn/ui",
  ],
  colors: {
    light: brandHex.light.background,
    dark: brandHex.dark.background,
  },
} as const;
