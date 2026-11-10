import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { previewState, StateMatrix } from "./state-matrix";
import { DesignSection, Example } from "./section";

const radii = [
  { name: "sm", className: "rounded-sm", use: "accents" },
  { name: "md", className: "rounded-md", use: "menu items, badges" },
  { name: "lg", className: "rounded-lg", use: "buttons, inputs" },
  { name: "xl", className: "rounded-xl", use: "cards, dialogs" },
];

const buttonVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

const chart = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

export function RadiusSection() {
  return (
    <DesignSection
      id="radius"
      description="--radius: 0.5rem. No shadows: depth comes from borders and surface steps."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Example title="Radius">
          <div className="flex flex-wrap gap-4">
            {radii.map((radius) => (
              <figure
                key={radius.name}
                className="flex flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    "size-12 border bg-secondary",
                    radius.className,
                  )}
                />
                <figcaption className="text-center font-mono text-xs text-muted-foreground">
                  {radius.name}
                  <br />
                  <span className="font-sans">{radius.use}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Example>
        <Example title="States" description="rest · hover · focus">
          <div className="flex gap-3">
            {(["default", "hover", "focus"] as const).map((state) => (
              <Button
                key={state}
                variant="outline"
                className="flex-1 font-mono text-xs"
                {...previewState(state)}
              >
                {state === "default" ? "rest" : state}
              </Button>
            ))}
          </div>
        </Example>
        <Example title="Chart" description="Greyscale ramp for data.">
          <div className="grid grid-cols-5 gap-2">
            {chart.map((token) => (
              <figure key={token} className="flex flex-col gap-1.5">
                <div
                  className="h-6 rounded-sm"
                  style={{ background: `var(--${token})` }}
                />
                <figcaption className="font-mono text-xs text-muted-foreground">
                  {token}
                </figcaption>
              </figure>
            ))}
          </div>
        </Example>
      </div>
      <Example title="Button states" description="Pinned with data-preview.">
        <StateMatrix
          rows={buttonVariants}
          render={(variant, state) => (
            <Button variant={variant} {...previewState(state)}>
              Export
            </Button>
          )}
        />
        <div className="flex items-center gap-3">
          <Button disabled>
            <Spinner data-icon="inline-start" />
            Redirecting to GitHub…
          </Button>
        </div>
      </Example>
      <Example title="Field states">
        <StateMatrix
          rows={["input"] as const}
          states={["default", "hover", "focus", "disabled", "invalid"]}
          render={(_, state) => (
            <Input
              placeholder="Project name"
              aria-label={`Project name, ${state}`}
              aria-invalid={state === "invalid" || undefined}
              {...previewState(state)}
            />
          )}
        />
      </Example>
    </DesignSection>
  );
}
