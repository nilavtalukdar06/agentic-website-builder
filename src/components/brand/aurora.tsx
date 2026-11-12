import { cn } from "@/lib/utils";

export type AuroraProps = React.ComponentProps<"div">;

export function Aurora({ className, ...props }: AuroraProps) {
  return (
    <div
      aria-hidden
      data-slot="aurora"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="aurora absolute inset-[-6%] motion-safe:animate-aurora" />
    </div>
  );
}
