import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatHeader } from "@/components/workspace/chat-header";
import { emptyLiveRun } from "@/lib/agent/live-run";
import { MobileBar } from "@/components/workspace/mobile-bar";
import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";
import { ChatMessage, type ConversationMessage } from "./chat-message";
import { pickDefaultFile } from "./code-panel";
import { LiveReply } from "./live-reply";
import { overlaySteps } from "./preview-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/p/demo",
}));

const base: ConversationMessage = {
  id: "run_r1_reply",
  role: "ASSISTANT",
  content: "Built it",
  parts: [],
  model: null,
  replyToId: "u1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  pending: false,
  stopping: false,
  version: null,
  attachments: [],
};

function renderMessage(
  message: Partial<ConversationMessage>,
  props: Partial<React.ComponentProps<typeof ChatMessage>> = {},
) {
  const handlers = {
    onRetry: vi.fn(),
    onRestore: vi.fn(),
    onViewCode: vi.fn(),
  };
  render(
    <TooltipProvider>
      <ChatMessage
        projectId="p1"
        message={{ ...base, ...message }}
        {...handlers}
        {...props}
      />
    </TooltipProvider>,
  );
  return handlers;
}

describe("ChatMessage", () => {
  test("renders the build summary, sources, reply and checkpoint", () => {
    const handlers = renderMessage(
      {
        parts: [
          {
            type: "task",
            title: "Built Ember & Oak",
            items: [
              { kind: "sandbox", label: "Created sandbox" },
              { kind: "file", verb: "created", path: "app/page.tsx", lines: 9 },
            ],
          },
          {
            type: "sources",
            sources: [{ title: "Stripe", url: "https://stripe.com" }],
          },
          { type: "guard", stage: "input", verdict: "review" },
          { type: "text", text: "Ember & Oak is running." },
        ],
        version: { number: 2, title: "First", creditCost: 42 },
      },
      { canRestore: true, canRetry: true },
    );
    expect(screen.getByText("Built Ember & Oak · 1 file")).toBeInTheDocument();
    expect(screen.getByText("Used 1 source")).toBeInTheDocument();
    expect(screen.getByText("Restricted run")).toBeInTheDocument();
    expect(screen.getByText("Ember & Oak is running.")).toBeInTheDocument();
    expect(screen.getByText("v2 · 42 credits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore version 2" }));
    expect(handlers.onRestore).toHaveBeenCalledWith(2);
    fireEvent.click(
      screen.getByRole("button", { name: "View code of version 2" }),
    );
    expect(handlers.onViewCode).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalled();
  });

  test("errors show as an alert and hide retry and restore when not allowed", () => {
    renderMessage({
      content: "Something went wrong",
      parts: [{ type: "error", message: "Something went wrong" }],
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("a queued prompt shows its state", () => {
    renderMessage(
      { id: "u2", role: "USER", content: "Add a footer", pending: true },
      { status: "queued" },
    );
    expect(screen.getByText("Add a footer")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});

describe("LiveReply", () => {
  test("says Thinking while it works and Stopping once the user stopped it", () => {
    const live = { ...emptyLiveRun(), state: "thinking" as const };
    const { rerender } = render(
      <LiveReply live={live} projectName="Ember & Oak" />,
    );
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    rerender(<LiveReply live={live} projectName="Ember & Oak" stopping />);
    expect(screen.getByText("Stopping…")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).toBeNull();
  });
});

describe("task rows", () => {
  test("reads, skills, deletes and line counts", () => {
    renderMessage({
      parts: [
        {
          type: "task",
          title: "Built it",
          items: [
            { kind: "skill", name: "shadcn" },
            { kind: "read", paths: ["a.ts", "b.ts", "c.ts", "d.ts"] },
            { kind: "file", verb: "edited", path: "app/page.tsx", lines: 12 },
            { kind: "file", verb: "deleted", path: "old.tsx", lines: 0 },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByText("Built it · 1 file"));
    expect(screen.getByText("Loaded skill")).toBeInTheDocument();
    expect(screen.getByText("shadcn")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
  });

  test("the latest version is marked current instead of restorable", () => {
    renderMessage(
      { version: { number: 3, title: "Latest", creditCost: 1 } },
      { isLatestVersion: true, canRestore: true },
    );
    expect(
      screen.getByRole("button", { name: "Current version" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Restore/ })).toBeNull();
  });
});

describe("overlaySteps", () => {
  test("shows a starting row before the first event", () => {
    expect(overlaySteps([])).toEqual([
      expect.objectContaining({ verb: "Starting the agent", status: "active" }),
    ]);
  });

  test("keeps the newest seven steps with icons except for files", () => {
    const steps = Array.from({ length: 9 }, (_, index) => ({
      id: `s${index}`,
      kind: index === 8 ? ("file" as const) : ("command" as const),
      label: index === 8 ? "Creating" : "Ran",
      detail: index === 8 ? "app/page.tsx" : "npm run lint",
      path: index === 8 ? "app/page.tsx" : null,
      status: index === 8 ? ("active" as const) : ("done" as const),
    }));
    const rows = overlaySteps(steps);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ id: "s2", verb: "Ran" });
    expect(rows[0].icon).toBeDefined();
    expect(rows.at(-1)).toMatchObject({
      verb: "Creating",
      path: "app/page.tsx",
      status: "active",
      icon: undefined,
    });
  });
});

describe("pickDefaultFile", () => {
  test("prefers the home page", () => {
    expect(pickDefaultFile(["a.ts", "app/page.tsx"])).toBe("app/page.tsx");
    expect(pickDefaultFile(["b.ts"])).toBe("b.ts");
    expect(pickDefaultFile([])).toBeNull();
  });
});

describe("ChatHeader", () => {
  test("shows the version, switches projects and collapses the chat", async () => {
    const onCollapse = vi.fn();
    render(
      <TooltipProvider>
        <ChatHeader
          projectName="Ember & Oak"
          building={false}
          version={3}
          projects={[{ slug: "lumen", name: "Lumen" }]}
          onCollapse={onCollapse}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("v3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide chat" }));
    expect(onCollapse).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Ember & Oak. Switch project" }),
    );
    expect(await screen.findByText("Lumen")).toBeInTheDocument();
    expect(screen.getByText("All projects")).toBeInTheDocument();
  });

  test("shows Building while a prompt is pending", () => {
    render(
      <TooltipProvider>
        <ChatHeader projectName="Ember & Oak" building />
      </TooltipProvider>,
    );
    expect(screen.getByText("Building")).toBeInTheDocument();
  });
});

describe("WorkspaceToolbar", () => {
  function renderToolbar(
    props: Partial<React.ComponentProps<typeof WorkspaceToolbar>> = {},
  ) {
    const handlers = {
      onViewChange: vi.fn(),
      onReload: vi.fn(),
      onExport: vi.fn(),
    };
    render(
      <ThemeProvider>
        <TooltipProvider>
          <WorkspaceToolbar
            view="preview"
            onViewChange={handlers.onViewChange}
            onExport={handlers.onExport}
            preview={{
              url: "https://3000-sbx.e2b.app/",
              device: "desktop",
              onDeviceChange: vi.fn(),
              onReload: handlers.onReload,
            }}
            building={false}
            user={{ name: "Nilav T" }}
            {...props}
          />
        </TooltipProvider>
      </ThemeProvider>,
    );
    return handlers;
  }

  test("preview controls show the address and reload", () => {
    const handlers = renderToolbar();
    expect(screen.getByLabelText("Preview URL")).toHaveValue(
      "3000-sbx.e2b.app",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(handlers.onReload).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Export to GitHub/ }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Export to GitHub/ }));
    expect(handlers.onExport).toHaveBeenCalled();
  });

  test("code view hides the preview controls and the tab switches views", () => {
    const handlers = renderToolbar({ view: "code" });
    expect(screen.queryByLabelText("Preview URL")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(handlers.onViewChange).toHaveBeenCalledWith("preview");
  });
});

describe("MobileBar", () => {
  test("keeps an accessible repository link and re-export after a push", () => {
    const handlers = renderBar({ githubRepo: "owner/demo" });
    expect(screen.getByRole("link", { name: "On GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/owner/demo",
    );
    expect(screen.getByText("On GitHub")).toHaveClass("sr-only");
    fireEvent.click(screen.getByRole("button", { name: "Re-export" }));
    expect(handlers.onExport).toHaveBeenCalled();
  });
  function renderBar(
    props: Partial<React.ComponentProps<typeof MobileBar>> = {},
  ) {
    const handlers = {
      onOpenChat: vi.fn(),
      onExport: vi.fn(),
      onReload: vi.fn(),
    };
    render(
      <ThemeProvider>
        <MobileBar
          previewUrl="https://3000-sbx.e2b.app/"
          building={false}
          {...handlers}
          {...props}
        />
      </ThemeProvider>,
    );
    return handlers;
  }

  test("opens chat and the shared export flow", () => {
    const handlers = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(handlers.onOpenChat).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(handlers.onExport).toHaveBeenCalled();
  });

  test("links to the repository once it is exported", () => {
    renderBar({ githubRepo: "me/ember" });
    expect(screen.getByRole("link", { name: /On GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/me/ember",
    );
  });

  test("the menu has no code view on a phone", async () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Open in new tab" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Code" })).toBeNull();
  });
});
