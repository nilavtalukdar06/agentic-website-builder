import { ImageResponse } from "next/og";
import { BrandMarkImage } from "@/components/brand/brand-image";
import { brandHex } from "@/components/brand/logo-paths";

export const alt = "Vibe — describe a website, watch it get built";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        gap: 40,
        background: brandHex.dark.background,
        color: brandHex.dark.foreground,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <BrandMarkImage size={120} />
        <div style={{ fontSize: 128, fontWeight: 600, letterSpacing: -4 }}>
          vibe
        </div>
      </div>
      <div style={{ fontSize: 40, color: brandHex.dark.muted, maxWidth: 900 }}>
        Describe a website. Vibe writes the Next.js code in a live sandbox while
        you watch.
      </div>
    </div>,
    size,
  );
}
