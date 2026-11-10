import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

export type LogoProps = React.ComponentProps<"span"> & {
  size?: number;
};

export function Logo({ size = 20, className, ...props }: LogoProps) {
  return (
    <span
      data-slot="logo"
      className={cn("inline-flex items-center text-foreground", className)}
      style={{ gap: size * 0.4 }}
      {...props}
    >
      <LogoMark size={size} />
      <span
        className="leading-none font-semibold tracking-tight"
        style={{ fontSize: size * 1.05 }}
      >
        vibe
      </span>
    </span>
  );
}
