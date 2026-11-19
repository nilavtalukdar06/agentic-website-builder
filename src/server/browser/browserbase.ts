import "server-only";
import Browserbase from "@browserbasehq/sdk";
import {
  browserbase,
  Stagehand,
  type StagehandBrowser,
} from "@browserbasehq/stagehand";
import {
  INIT_SCRIPT,
  parseVerdict,
  REPORT_SCRIPT,
  verdictInstruction,
} from "./checks";
import { createGenerate } from "./llm";
import {
  assertSameOrigin,
  type BrowserProvider,
  type BrowserSession,
  type PageReport,
  previewTarget,
  viewports,
} from "./types";

export const SESSION_TIMEOUT_SECONDS = 300;
const NAVIGATION_TIMEOUT_MS = 20_000;
const SETTLE_MS = 600;
export const ACTION_SETTLE_MS = 1500;

export function browserbaseProvider(apiKey: string): BrowserProvider {
  return {
    async open({ previewUrl, model, onModelCall, beforeModelCall, signal }) {
      const host = new URL(previewUrl).hostname;
      const browser: StagehandBrowser = await browserbase.launch({
        apiKey,
        api_timeout: SESSION_TIMEOUT_SECONDS,
        browserSettings: {
          recordSession: false,
          blockAds: true,
          viewport: {
            width: viewports.desktop.width,
            height: viewports.desktop.height,
          },
          allowedDomains: [host],
        },
        userMetadata: { app: "vibe", purpose: "build-check" },
      });
      let stagehand: Stagehand | undefined;
      try {
        const sessionId = browser.sessionId;
        const live = sessionId
          ? await new Browserbase({ apiKey }).sessions
              .debug(sessionId)
              .catch(() => null)
          : null;
        stagehand = await Stagehand.create({
          browser,
          model: {
            generate: createGenerate(
              model,
              onModelCall,
              beforeModelCall,
              signal,
            ),
          },
          logging: { level: "error", format: "json" },
        });
        const agent = stagehand;
        await browser.context.addInitScript(INIT_SCRIPT);
        const page =
          (await browser.context.activePage()) ??
          (await browser.context.newPage());

        const session: BrowserSession = {
          liveUrl: live?.debuggerFullscreenUrl ?? null,
          async visit(path, viewport) {
            const size = viewports[viewport];
            await page.setViewportSize(size.width, size.height);
            await page.goto(previewTarget(previewUrl, path), {
              waitUntil: "domcontentloaded",
              timeout: NAVIGATION_TIMEOUT_MS,
            });
            await page.waitForTimeout(SETTLE_MS);
            assertSameOrigin(previewUrl, await page.url());
            return (await page.evaluate(REPORT_SCRIPT)) as PageReport;
          },
          screenshot() {
            return page.screenshot({ type: "png" });
          },
          async interact(action, expect) {
            const acted = await agent.act(action, { page });
            assertSameOrigin(previewUrl, await page.url());
            if (!acted.data.success) {
              return {
                outcome: "untestable",
                detail: acted.data.message || "the control couldn't be found",
              };
            }
            await page.waitForTimeout(ACTION_SETTLE_MS);
            const verdict = await agent.extract(verdictInstruction(expect), {
              page,
            });
            assertSameOrigin(previewUrl, await page.url());
            return parseVerdict(verdict.data);
          },
          async close() {
            await agent.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
          },
        };
        return session;
      } catch (error) {
        await stagehand?.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        throw error;
      }
    },
  };
}
