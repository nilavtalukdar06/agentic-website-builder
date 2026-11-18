import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const state = vi.hoisted(() => ({
  params: { file: null as string | null, version: null as number | null },
  data: null as unknown,
}));

vi.mock("nuqs", async (original) => ({
  ...(await original<object>()),
  useQueryStates: () => [state.params, vi.fn()],
}));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    version: {
      files: {
        queryOptions: (input: object) => ({
          queryKey: ["version.files", input],
          queryFn: async () => state.data,
        }),
      },
    },
  }),
}));
vi.mock("@/components/ai-elements/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => (
    <pre data-testid="viewer">{code}</pre>
  ),
  CodeBlockCopyButton: () => null,
}));
vi.mock("./editable-file", () => ({
  EditableFile: ({
    path,
    serverValue,
    locked,
  }: {
    path: string;
    serverValue: string;
    locked: boolean;
  }) => (
    <div data-testid="editor" data-locked={locked}>
      {path}: {serverValue}
    </div>
  ),
}));
vi.mock("./user-terminal", () => ({
  UserTerminal: ({ locked }: { locked: boolean }) => (
    <div data-testid="terminal" data-locked={locked} />
  ),
}));
vi.mock("./unsaved-edits-bar", () => ({
  UnsavedEditsBar: ({ locked }: { locked: boolean }) => (
    <div data-testid="unsaved" data-locked={locked} />
  ),
}));

const { CodePanel } = await import("./code-panel");

const version = (extra: object = {}) => ({
  number: 3,
  title: "Footer",
  files: {
    "app/page.tsx": "export default 1;",
    "public/logo.svg": "data:image/svg+xml;base64,AAAA",
  },
  dirty: false,
  changes: {},
  ...extra,
});

async function setup(props: { building?: boolean } = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <CodePanel
          projectId="p1"
          projectSlug="demo"
          latestVersion={3}
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("tree", { name: "Project files" }).catch(() => null);
}

beforeEach(() => {
  state.params = { file: "app/page.tsx", version: null };
  state.data = version();
});

describe("CodePanel editing", () => {
  test("the latest version of a text file is editable, with the terminal one click away", async () => {
    await setup();
    expect(await screen.findByTestId("editor")).toHaveTextContent(
      "app/page.tsx: export default 1;",
    );
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-locked",
      "false",
    );
    expect(screen.queryByTestId("viewer")).toBeNull();
    expect(screen.queryByTestId("terminal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open the terminal" }));
    expect(screen.getByTestId("terminal")).toHaveAttribute(
      "data-locked",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close the terminal" }));
    expect(screen.queryByTestId("terminal")).toBeNull();
  });

  test("while Vibe builds, everything is locked and the panel says why", async () => {
    await setup({ building: true });
    expect(await screen.findByTestId("editor")).toHaveAttribute(
      "data-locked",
      "true",
    );
    expect(screen.getByText(/Vibe is building/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open the terminal" }));
    expect(screen.getByTestId("terminal")).toHaveAttribute(
      "data-locked",
      "true",
    );
  });

  test("unsaved edits show the save and discard bar", async () => {
    state.data = version({ dirty: true, title: "Your unsaved edits" });
    await setup();
    expect(await screen.findByTestId("unsaved")).toBeInTheDocument();
  });

  test("an older version is a read-only view without the editor, the bar or the terminal", async () => {
    state.params = { file: "app/page.tsx", version: 2 };
    state.data = version({ number: 2, dirty: true });
    await setup();
    expect(await screen.findByTestId("viewer")).toHaveTextContent(
      "export default 1;",
    );
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(screen.queryByTestId("unsaved")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open the terminal" }),
    ).toBeNull();
  });

  test("images aren't opened in the editor", async () => {
    state.params = { file: "public/logo.svg", version: null };
    await setup();
    expect(
      await screen.findByRole("img", { name: "public/logo.svg" }),
    ).toBeVisible();
    expect(screen.queryByTestId("editor")).toBeNull();
  });
});
