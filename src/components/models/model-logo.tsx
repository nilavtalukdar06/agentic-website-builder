import { BotIcon } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { type ModelLogoKey, modelLogoData } from "./model-logos.generated";

const providerLogos: Record<string, ModelLogoKey> = {
  anthropic: "claude",
  openai: "openai",
  google: "gemini",
  moonshotai: "kimi",
  zai: "zai",
  deepseek: "deepseek",
  alibaba: "alibaba",
  mistral: "mistral",
};

export function modelLogoKey(modelId: string): ModelLogoKey | null {
  const [provider, name = ""] = modelId.split("/");
  if (/codex/i.test(name)) return "codex";
  return Object.hasOwn(providerLogos, provider)
    ? providerLogos[provider]
    : null;
}

export function scopeLogoIds(
  body: string,
  ids: readonly string[],
  scope: string,
) {
  return ids.reduce(
    (markup, id) => markup.replaceAll(id, `${id}-${scope}`),
    body,
  );
}

export type ModelLogoProps = Omit<React.ComponentProps<"svg">, "children"> & {
  modelId: string;
};

export function ModelLogo({ modelId, className, ...props }: ModelLogoProps) {
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const key = modelLogoKey(modelId);

  if (!key) {
    return (
      <BotIcon
        data-slot="model-logo"
        data-logo="generic"
        aria-hidden
        className={cn("size-4 shrink-0", className)}
      />
    );
  }

  const logo = modelLogoData[key];
  return (
    <svg
      data-slot="model-logo"
      data-logo={key}
      viewBox={logo.viewBox}
      fill="currentColor"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      dangerouslySetInnerHTML={{
        __html: scopeLogoIds(logo.body, logo.ids, scope),
      }}
      {...props}
    />
  );
}
