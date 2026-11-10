import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

export type AppIconProps = React.ComponentProps<"span"> & {
  variant?: "dark" | "light";
  size?: number;
};

export function AppIcon({
  variant = "dark",
  size = 40,
  className,
  ...props
}: AppIconProps) {
  return (
    <span
      data-slot="app-icon"
      data-variant={variant}
      className={cn(
        variant,
        "inline-flex shrink-0 items-center justify-center border bg-background text-foreground",
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      {...props}
    >
      <LogoMark size={Math.round(size * 0.55)} />
    </span>
  );
}
