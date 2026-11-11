import { BotIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ModelLogoProvider, modelLogoData } from "./model-logos.generated";

export function hasModelLogo(provider: string): provider is ModelLogoProvider {
  return Object.hasOwn(modelLogoData, provider);
}

export type ModelLogoProps = Omit<React.ComponentProps<"svg">, "children"> & {
  provider: string;
};

export function ModelLogo({ provider, className, ...props }: ModelLogoProps) {
  if (!hasModelLogo(provider)) {
    return (
      <BotIcon
        data-slot="model-logo"
        data-provider="generic"
        aria-hidden
        className={cn("size-4 shrink-0", className)}
      />
    );
  }

  const logo = modelLogoData[provider];
  return (
    <svg
      data-slot="model-logo"
      data-provider={provider}
      viewBox={logo.viewBox}
      fill="currentColor"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: logo.body }}
      {...props}
    />
  );
}
