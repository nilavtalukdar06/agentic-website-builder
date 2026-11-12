import { AppIcon, Logo, LogoMark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { DesignSection } from "./section";

function Tile({
  label,
  scope,
  children,
}: {
  label: string;
  scope?: "light" | "dark";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        scope,
        "flex min-h-52 flex-col rounded-xl border bg-card p-4 text-card-foreground",
      )}
    >
      <span className="text-caption text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center justify-center gap-4">
        {children}
      </div>
    </div>
  );
}

export function BrandSection() {
  return (
    <DesignSection
      id="brand"
      description="One rounded V filled with an orange to pink to violet gradient, the same colours as the Home and sign-in gradient. It looks the same in both themes, so it works on any background."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Lockup · light" scope="light">
          <Logo size={36} />
        </Tile>
        <Tile label="Lockup · dark" scope="dark">
          <Logo size={36} />
        </Tile>
        <Tile label="App icon">
          <AppIcon variant="dark" size={88} />
          <AppIcon variant="light" size={88} />
        </Tile>
        <Tile label="Sizes">
          <div className="flex items-end gap-6">
            {[16, 24, 40].map((size) => (
              <figure key={size} className="flex flex-col items-center gap-3">
                <LogoMark size={size} />
                <figcaption className="font-mono text-xs text-muted-foreground">
                  {size}
                </figcaption>
              </figure>
            ))}
            <figure className="flex flex-col items-center gap-3">
              <AppIcon variant="light" size={32} />
              <figcaption className="font-mono text-xs text-muted-foreground">
                favicon
              </figcaption>
            </figure>
          </div>
        </Tile>
      </div>
    </DesignSection>
  );
}
