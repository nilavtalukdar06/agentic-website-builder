import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  browserEmbedUrl,
  BrowserReport,
  BrowserSession,
  LiveBrowserView,
} from "./browser-session";
import type { BrowserPart } from "@/lib/agent/parts";

const url =
  "https://www.browserbase.com/devtools-fullscreen/session?token=test";
const part: BrowserPart = {
  type: "browser",
  status: "passed",
  reason: null,
  checks: [
    {
      id: "home",
      kind: "page",
      label: "Home loads",
      route: "/",
      viewport: "desktop",
      status: "passed",
      detail: null,
    },
  ],
  screenshots: [],
};

describe("browser session", () => {
  it.each([
    "javascript:alert(1)",
    "https://www.browserbase.com.evil.test/devtools-fullscreen/x",
    "http://www.browserbase.com/devtools-fullscreen/x",
    "https://user@www.browserbase.com/devtools-fullscreen/x",
    "https://www.browserbase.com:444/devtools-fullscreen/x",
    "https://example.com/",
    "invalid",
  ])("rejects unsafe embed %s", (value) => {
    expect(browserEmbedUrl(value)).toBeNull();
  });
  it("keeps the live view inert and removes navigation chrome", () => {
    render(<LiveBrowserView liveUrl={url} />);
    const frame = screen.getByTitle("Live view of the agent's browser");
    expect(frame).toHaveAttribute("inert");
    expect(frame).toHaveAttribute("tabindex", "-1");
    expect(frame).not.toHaveAttribute("allow");
    expect(frame.getAttribute("src")).toContain("navbar=false");
  });
  it("trusts disconnect messages only from the embedded window, supports retry and new sessions", () => {
    const { rerender } = render(<LiveBrowserView liveUrl={url} />);
    const frame = screen.getByTitle(
      "Live view of the agent's browser",
    ) as HTMLIFrameElement;
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://www.browserbase.com",
          data: "browserbase-disconnected",
        }),
      ),
    );
    expect(frame).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://www.browserbase.com",
          source: frame.contentWindow,
          data: "browserbase-disconnected",
        }),
      ),
    );
    expect(screen.getByText("The live view is unavailable")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Reconnect live view" }),
    );
    expect(
      screen.getByTitle("Live view of the agent's browser"),
    ).toBeInTheDocument();
    fireEvent.error(screen.getByTitle("Live view of the agent's browser"));
    rerender(<LiveBrowserView liveUrl={url + "2"} />);
    expect(
      screen.getByTitle("Live view of the agent's browser"),
    ).toBeInTheDocument();
  });
  it("keeps check results visible when the viewer cannot connect", () => {
    render(
      <BrowserSession
        browser={{
          liveUrl: null,
          open: true,
          round: 1,
          checks: part.checks,
          status: null,
          summary: null,
        }}
      />,
    );
    expect(screen.getByText("Connecting to the browser…")).toBeVisible();
    expect(screen.getByText("Home loads")).toBeVisible();
    expect(screen.getByText("1 passed")).toBeVisible();
    expect(screen.getByText("re-check 1")).toBeVisible();
  });
  it("shows saved desktop and phone screenshots in accessible dialogs", () => {
    render(
      <BrowserReport
        part={{
          ...part,
          screenshots: [
            { key: "d", viewport: "desktop", url: "/desktop.png" },
            { key: "p", viewport: "phone", url: "/phone.png" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Phone screenshot/ }));
    expect(
      screen.getByRole("dialog", { name: "Phone screenshot" }),
    ).toBeVisible();
  });
  it("distinguishes skipped, empty and failed reports", () => {
    const { rerender } = render(
      <BrowserReport
        part={{
          ...part,
          status: "skipped",
          reason: "no Browserbase key is set",
        }}
      />,
    );
    expect(screen.getByText("The browser check didn’t run")).toBeVisible();
    rerender(<BrowserReport part={{ ...part, checks: [] }} />);
    expect(
      screen.getByText("No browser check results were saved."),
    ).toBeVisible();
    expect(screen.getByText(/No screenshots available/)).toBeVisible();
    rerender(<BrowserReport part={{ ...part, status: "failed" }} />);
    expect(
      screen.getByText("The browser check did not finish successfully"),
    ).toBeVisible();
  });
  it("shows a step the browser couldn't test as muted, not failed", () => {
    render(
      <BrowserReport
        part={{
          ...part,
          checks: [
            ...part.checks,
            {
              id: "act-0",
              kind: "interaction",
              label: "Click a sidebar nav item",
              route: "/",
              viewport: "desktop",
              status: "skipped",
              detail: "Couldn't test this step: No action found",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByText(
        "Checked in the browser: 1 checks passed, 1 couldn't be tested",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByText(
        "Checked in the browser: 1 checks passed, 1 couldn't be tested",
      ),
    );
    expect(screen.getByLabelText("Couldn't test")).toBeInTheDocument();
    expect(screen.queryByLabelText("Failed")).toBeNull();
    expect(
      screen.getByText("Couldn't test this step: No action found"),
    ).not.toHaveClass("text-destructive");
  });
});
