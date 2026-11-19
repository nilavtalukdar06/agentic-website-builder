import {
  assertSameOrigin,
  type BrowserProvider,
  type InteractionResult,
  type PageReport,
  previewTarget,
  type ViewportName,
} from "./types";

export type FakePage = Partial<PageReport> & { url?: string };

export type FakeBrowserScript = {
  liveUrl?: string | null;
  pages?: Record<string, FakePage>;
  interactions?: Record<string, InteractionResult & { navigateTo?: string }>;
  failOpen?: Error;
};

export function cleanReport(url: string): PageReport {
  return {
    url,
    title: "Site",
    errors: [],
    overlay: false,
    overflow: null,
    brokenImages: [],
    emptyMain: false,
  };
}

export function fakeBrowserProvider(script: FakeBrowserScript = {}) {
  const visits: { path: string; viewport: ViewportName }[] = [];
  const actions: string[] = [];
  let closed = 0;
  const provider: BrowserProvider = {
    async open({ previewUrl, onModelCall, beforeModelCall }) {
      if (script.failOpen) throw script.failOpen;
      let current = previewUrl;
      return {
        liveUrl:
          script.liveUrl === undefined
            ? "https://www.browserbase.com/devtools-fullscreen/fake"
            : script.liveUrl,
        async visit(path, viewport) {
          visits.push({ path, viewport });
          current = previewTarget(previewUrl, path);
          const page =
            script.pages?.[`${path}@${viewport}`] ?? script.pages?.[path] ?? {};
          if (page.url) current = page.url;
          assertSameOrigin(previewUrl, current);
          return { ...cleanReport(current), ...page, url: current };
        },
        async screenshot() {
          return new Uint8Array([137, 80, 78, 71]);
        },
        async interact(action) {
          await beforeModelCall?.();
          actions.push(action);
          onModelCall({
            usage: {
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
              outputTokens: 10,
            },
            estimatedUsd: 0.001,
            generationIds: [],
          });
          const result = script.interactions?.[action] ?? {
            outcome: "passed" as const,
            detail: "it worked",
          };
          if (result.navigateTo) current = result.navigateTo;
          assertSameOrigin(previewUrl, current);
          return { outcome: result.outcome, detail: result.detail };
        },
        async close() {
          closed += 1;
        },
      };
    },
  };
  return {
    provider,
    visits,
    actions,
    closedCount: () => closed,
  };
}
