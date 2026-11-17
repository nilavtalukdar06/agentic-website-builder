import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  canvasTokens,
  chartTokens,
  codeTokens,
  contrastPairs,
  derivedTokens,
  type ColorToken,
} from "../_data/tokens";
import { ColorPair } from "./color-pair";
import { DesignSection, Example } from "./section";

function Swatch({
  token,
  mode,
}: {
  token: ColorToken;
  mode: "light" | "dark";
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="size-8 shrink-0 rounded-md border"
        style={{ background: `var(--${token.name})` }}
      />
      <span className="flex min-w-0 flex-col font-mono text-xs leading-tight">
        <span className="truncate">--{token.name}</span>
        <span className="truncate text-muted-foreground">{token[mode]}</span>
      </span>
    </li>
  );
}

function ThemePanel({
  mode,
  tokens,
  title,
}: {
  mode: "light" | "dark";
  tokens: ColorToken[];
  title: string;
}) {
  return (
    <div
      data-testid={`color-panel-${mode}`}
      className={cn(mode, "rounded-xl border bg-card p-5 text-card-foreground")}
    >
      <h3 className="mb-4 text-card-title">
        {title} · {mode}{" "}
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {mode === "light" ? ":root" : ".dark"}
        </span>
      </h3>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {tokens.map((token) => (
          <Swatch key={token.name} token={token} mode={mode} />
        ))}
      </ul>
    </div>
  );
}

export function ColorSection() {
  return (
    <DesignSection
      id="color"
      description="Neutral greys, 1px borders, no shadows. Color is reserved for focus rings, status and third-party logos."
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ThemePanel mode="light" title="Color" tokens={canvasTokens} />
        <ThemePanel mode="dark" title="Color" tokens={canvasTokens} />
      </div>
      <Example
        title="Derived tokens"
        description="Not on the canvas; derived from it. Marked for sign-off."
      >
        <div className="flex flex-wrap gap-2">
          {[...derivedTokens, ...chartTokens, ...codeTokens].map((token) => (
            <Badge key={token.name} variant="outline" className="font-mono">
              <span
                className="size-2.5 rounded-full border"
                style={{ background: `var(--${token.name})` }}
              />
              --{token.name}
            </Badge>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ThemePanel
            mode="light"
            title="Derived"
            tokens={[...derivedTokens, ...codeTokens]}
          />
          <ThemePanel
            mode="dark"
            title="Derived"
            tokens={[...derivedTokens, ...codeTokens]}
          />
        </div>
      </Example>
      <Example
        title="Contrast"
        description="Measured live against the active theme. Text pairs must reach AA (4.5:1)."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {contrastPairs.map((pair) => (
            <ColorPair key={pair.name} {...pair} />
          ))}
        </div>
      </Example>
    </DesignSection>
  );
}
