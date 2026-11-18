import type { AgentModel } from "@/lib/ai/models";
import type { TokenUsage } from "@/server/billing/pricing";

export const viewports = {
  desktop: { width: 1280, height: 800, label: "Desktop" },
  phone: { width: 390, height: 844, label: "Phone" },
} as const;

export type ViewportName = keyof typeof viewports;

export type PageReport = {
  url: string;
  title: string;
  errors: string[];
  overlay: boolean;
  overflow: {
    scrollWidth: number;
    innerWidth: number;
    offender: string | null;
  } | null;
  brokenImages: string[];
  emptyMain: boolean;
};

export type InteractionResult = { passed: boolean; detail: string };

export type BrowserModelCall = {
  usage: TokenUsage;
  estimatedUsd: number;
  generationIds: string[];
};

export type BrowserSession = {
  liveUrl: string | null;
  visit(path: string, viewport: ViewportName): Promise<PageReport>;
  screenshot(): Promise<Uint8Array>;
  interact(action: string, expect: string): Promise<InteractionResult>;
  close(): Promise<void>;
};

export type OpenSessionInput = {
  previewUrl: string;
  model: AgentModel;
  onModelCall: (call: BrowserModelCall) => void;
  beforeModelCall?: () => Promise<void>;
  signal?: AbortSignal;
};

export type BrowserProvider = {
  open(input: OpenSessionInput): Promise<BrowserSession>;
};

export class OriginError extends Error {
  constructor(expected: string, actual: string) {
    super(`The page left the preview (${actual} instead of ${expected}).`);
    this.name = "OriginError";
  }
}

export function previewTarget(previewUrl: string, path: string) {
  const base = new URL(previewUrl);
  const clean = `/${path.replace(/^\/+/, "")}`;
  const target = new URL(clean, base.origin);
  if (target.origin !== base.origin) {
    throw new OriginError(base.origin, target.origin);
  }
  return target.toString();
}

export function assertSameOrigin(previewUrl: string, current: string) {
  const expected = new URL(previewUrl).origin;
  let actual: string;
  try {
    actual = new URL(current).origin;
  } catch {
    actual = current;
  }
  if (actual !== expected) throw new OriginError(expected, actual);
}
