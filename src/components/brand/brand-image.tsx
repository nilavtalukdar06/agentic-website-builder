import {
  brandHex,
  logoPrimaryStroke,
  logoSecondaryStroke,
  logoStrokeWidth,
  logoViewBox,
} from "./logo-paths";

export function BrandMarkImage({
  size,
  color = brandHex.dark.foreground,
}: {
  size: number;
  color?: string;
}) {
  return (
    <svg
      viewBox={logoViewBox}
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={logoStrokeWidth}
      strokeLinecap="round"
    >
      <path d={logoSecondaryStroke} opacity={0.5} />
      <path d={logoPrimaryStroke} />
    </svg>
  );
}
