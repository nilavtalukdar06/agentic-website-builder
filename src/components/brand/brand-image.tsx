import {
  logoGradient,
  logoPath,
  logoStrokeWidth,
  logoViewBox,
} from "./logo-paths";

export function BrandMarkImage({ size }: { size: number }) {
  return (
    <svg viewBox={logoViewBox} width={size} height={size} fill="none">
      <defs>
        <linearGradient
          id="brand-mark-gradient"
          gradientUnits="userSpaceOnUse"
          x1={logoGradient.x1}
          y1={logoGradient.y1}
          x2={logoGradient.x2}
          y2={logoGradient.y2}
        >
          {logoGradient.stops.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
      </defs>
      <path
        d={logoPath}
        stroke="url(#brand-mark-gradient)"
        strokeWidth={logoStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
