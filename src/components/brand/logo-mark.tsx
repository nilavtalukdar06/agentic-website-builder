import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  logoGradient,
  logoPath,
  logoStrokeWidth,
  logoViewBox,
} from "./logo-paths";

export type LogoMarkProps = Omit<React.ComponentProps<"svg">, "children"> & {
  size?: number;
  title?: string;
};

export function LogoMark({
  size = 24,
  title,
  className,
  ...props
}: LogoMarkProps) {
  const gradientId = `logo-gradient-${useId().replace(/:/g, "")}`;

  return (
    <svg
      data-slot="logo-mark"
      viewBox={logoViewBox}
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={gradientId}
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
        stroke={`url(#${gradientId})`}
        strokeWidth={logoStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
