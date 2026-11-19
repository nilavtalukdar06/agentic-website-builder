import type { Diagnostic } from "@/server/sandbox/diagnostics";
import {
  type InteractionResult,
  type PageReport,
  type ViewportName,
  viewports,
} from "./types";

export const INIT_SCRIPT = `(() => {
  if (window.__vibe) return;
  const state = (window.__vibe = { errors: [] });
  const push = (message) => {
    if (state.errors.length < 20) state.errors.push(String(message).slice(0, 300));
  };
  const text = (value) =>
    value instanceof Error ? value.message : typeof value === "string" ? value : (() => {
      try { return JSON.stringify(value); } catch { return String(value); }
    })();
  window.addEventListener("error", (event) => {
    const target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      push("Failed to load " + (target.src || target.href));
    } else {
      push(event.message || "Script error");
    }
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    push("Unhandled promise rejection: " + text(event.reason && event.reason.message ? event.reason.message : event.reason));
  });
  const original = console.error;
  console.error = (...args) => {
    push(args.map(text).join(" "));
    return original.apply(console, args);
  };
})();`;

export const REPORT_SCRIPT = `(() => {
  const state = window.__vibe || { errors: [] };
  const width = window.innerWidth;
  const root = document.documentElement;
  let overflow = null;
  if (root.scrollWidth > width + 1) {
    let widest = null;
    let widestWidth = 0;
    for (const element of document.body.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      if (box.right <= width + 1 || box.width <= widestWidth) continue;
      if (getComputedStyle(element).position === "fixed") continue;
      widest = element;
      widestWidth = box.width;
    }
    let offender = null;
    if (widest) {
      const classes = typeof widest.className === "string"
        ? widest.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3)
        : [];
      offender = widest.tagName.toLowerCase() + (classes.length ? "." + classes.join(".") : "") + " (" + Math.round(widestWidth) + "px)";
    }
    overflow = { scrollWidth: root.scrollWidth, innerWidth: width, offender };
  }
  const brokenImages = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth === 0 && image.currentSrc)
    .map((image) => image.currentSrc)
    .slice(0, 5);
  const main = document.querySelector("main") || document.body;
  const emptyMain = (main.innerText || "").trim().length < 20 && main.querySelectorAll("img, svg, canvas, video").length === 0;
  const portal = document.querySelector("nextjs-portal");
  const overlay = !!(portal && portal.shadowRoot && portal.shadowRoot.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-overlay]"));
  return { url: location.href, title: document.title, errors: state.errors.slice(), overlay, overflow, brokenImages, emptyMain };
})()`;

const NOISE = [
  /Download the React DevTools/i,
  /\[HMR\]|\[Fast Refresh\]/,
  /WebSocket connection to .* failed/i,
  /favicon\.ico/i,
  /webpack-hmr|turbopack-hmr|__nextjs_original-stack-frame/i,
];

export const MAX_ERRORS_PER_PAGE = 3;

export function pageLabel(route: string, viewport: ViewportName) {
  const size = viewports[viewport];
  return `${route} at ${size.label.toLowerCase()} width (${size.width}px)`;
}

function diagnostic(message: string): Diagnostic {
  return { source: "browser", path: null, line: null, message };
}

export function pageReportToDiagnostics(
  report: PageReport,
  route: string,
  viewport: ViewportName,
): Diagnostic[] {
  const where = pageLabel(route, viewport);
  const found: Diagnostic[] = [];
  if (report.overlay) {
    found.push(diagnostic(`${where}: the Next.js error overlay is showing.`));
  }
  const errors = [
    ...new Set(
      report.errors.filter((error) => !NOISE.some((rule) => rule.test(error))),
    ),
  ];
  for (const error of errors.slice(0, MAX_ERRORS_PER_PAGE)) {
    found.push(diagnostic(`${where}: runtime error: ${error}`));
  }
  if (report.overflow) {
    const { scrollWidth, innerWidth, offender } = report.overflow;
    found.push(
      diagnostic(
        `${where}: the page scrolls sideways (content is ${scrollWidth}px wide in a ${innerWidth}px window)${offender ? `; widest element: ${offender}` : ""}.`,
      ),
    );
  }
  for (const image of report.brokenImages) {
    found.push(diagnostic(`${where}: an image failed to load: ${image}`));
  }
  if (report.emptyMain && !report.overlay) {
    found.push(diagnostic(`${where}: the page renders no visible content.`));
  }
  return found;
}

export function interactionDiagnostic(
  route: string,
  action: string,
  expect: string,
  detail: string,
): Diagnostic {
  return diagnostic(
    `${route}: "${action}" didn't work as expected. Expected: ${expect}. Seen: ${detail}`,
  );
}

export function pageSummary(diagnostics: Diagnostic[]) {
  return diagnostics.length === 0
    ? "No errors, nothing scrolls sideways, images load"
    : diagnostics
        .map((item) => item.message.replace(/^[^:]+: /, ""))
        .join(" · ");
}

export function verdictInstruction(expect: string) {
  return `Look at the page as it is now and decide whether this is true: "${expect}". Answer with PASS or FAIL, a colon, and one short sentence describing what the page shows, for example "FAIL: the list is still empty". If the page's text and controls can't show whether it is true (for example it depends on colours, highlights or animation), answer UNSURE and say why.`;
}

export function parseVerdict(data: unknown): InteractionResult {
  const raw =
    typeof data === "string"
      ? data
      : data && typeof data === "object" && "extraction" in data
        ? String((data as { extraction: unknown }).extraction)
        : "";
  const match = /^\W*(PASS|FAIL|UNSURE)\b\W*([\s\S]*)$/i.exec(raw.trim());
  if (!match) {
    return {
      outcome: "untestable",
      detail: raw.trim().slice(0, 200) || "the result couldn't be read",
    };
  }
  const word = match[1].toUpperCase();
  const outcome =
    word === "PASS" ? "passed" : word === "FAIL" ? "failed" : "untestable";
  return {
    outcome,
    detail:
      match[2].trim().slice(0, 200) ||
      (outcome === "passed"
        ? "as expected"
        : outcome === "failed"
          ? "not as expected"
          : "the page can't show this"),
  };
}
