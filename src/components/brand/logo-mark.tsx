import { cn } from "@/lib/utils";
import {
  logoPrimaryStroke,
  logoSecondaryStroke,
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
  return (
    <svg
      data-slot="logo-mark"
      viewBox={logoViewBox}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={logoStrokeWidth}
      strokeLinecap="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d={logoSecondaryStroke} opacity={0.5} />
      <path d={logoPrimaryStroke} />
    </svg>
  );
}
