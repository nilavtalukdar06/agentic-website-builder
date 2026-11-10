import { ImageResponse } from "next/og";
import { BrandMarkImage } from "@/components/brand/brand-image";
import { brandHex } from "@/components/brand/logo-paths";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brandHex.dark.background,
      }}
    >
      <BrandMarkImage size={104} />
    </div>,
    size,
  );
}
