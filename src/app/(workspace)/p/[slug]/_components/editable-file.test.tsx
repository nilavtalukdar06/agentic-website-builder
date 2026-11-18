import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const write = vi.hoisted(() => vi.fn());

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    code: {
      write: { mutationOptions: () => ({ mutationFn: write }) },
    },
    version: { pathFilter: () => ({ queryKey: ["version"] }) },
  }),
}));
vi.mock("./code-editor", () => ({
  CodeEditor: ({
    value,
    onChange,
    readOnly,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    readOnly?: boolean;
    label: string;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const { AUTOSAVE_MS, EditableFile } = await import("./editable-file");

function setup(props: Partial<React.ComponentProps<typeof EditableFile>> = {}) {
  const client = new QueryClient();
  const view = (extra: Partial<React.ComponentProps<typeof EditableFile>>) => (
    <QueryClientProvider client={client}>
      <EditableFile
        projectId="p1"
        path="app/page.tsx"
        serverValue="export default 1;"
        locked={false}
        {...props}
        {...extra}
      />
    </QueryClientProvider>
  );
  const result = render(view({}));
  return {
    ...result,
    rerenderWith: (extra: object) => result.rerender(view(extra)),
  };
}

const editor = () => screen.getByLabelText("Edit app/page.tsx");
const type = (value: string) =>
  fireEvent.change(editor(), { target: { value } });
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  write.mockReset().mockResolvedValue({ changed: true, previewUpdated: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("EditableFile", () => {
  test("shows the file and saves nothing until it is edited", async () => {
    setup();
    expect(editor()).toHaveValue("export default 1;");
    await flush(5000);
    expect(write).not.toHaveBeenCalled();
  });

  test("autosaves once, a second after typing stops", async () => {
    setup();
    type("export default 2;");
    await flush(AUTOSAVE_MS - 100);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsaved/)).toBeVisible();
    type("export default 3;");
    await flush(AUTOSAVE_MS - 100);
    expect(write).not.toHaveBeenCalled();
    await flush(200);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual({
      projectId: "p1",
      path: "app/page.tsx",
      content: "export default 3;",
    });
    expect(screen.getByText("Saved · preview updated")).toBeVisible();
  });

  test("says so when the preview isn't running", async () => {
    write.mockResolvedValue({ changed: true, previewUpdated: false });
    setup();
    type("a");
    await flush(AUTOSAVE_MS + 10);
    expect(
      screen.getByText("Saved · open the preview to see it"),
    ).toBeVisible();
  });

  test("⌘S and leaving the editor save right away", async () => {
    setup();
    type("one");
    fireEvent.keyDown(editor(), { key: "s", metaKey: true });
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    type("two");
    fireEvent.blur(editor());
    await flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0].content).toBe("two");
  });

  test("while Vibe builds the editor is read-only and nothing is saved", async () => {
    setup({ locked: true });
    expect(editor()).toHaveAttribute("readonly");
    expect(screen.getByText("Locked while Vibe builds")).toBeVisible();
    fireEvent.change(editor(), { target: { value: "x" } });
    fireEvent.keyDown(editor(), { key: "s", ctrlKey: true });
    await flush(AUTOSAVE_MS * 3);
    expect(write).not.toHaveBeenCalled();
  });

  test("a failed save shows why, doesn't retry in a loop, and retries on request or on the next edit", async () => {
    write.mockRejectedValueOnce(
      new Error("Editing is locked while Vibe is building."),
    );
    setup();
    type("x");
    await flush(AUTOSAVE_MS + 10);
    expect(screen.getByText(/Couldn’t save: Editing is locked/)).toBeVisible();
    await flush(AUTOSAVE_MS * 5);
    expect(write).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Saved · preview updated")).toBeVisible();
  });

  test("the echo of its own save isn't treated as someone else's change", async () => {
    const { rerenderWith } = setup();
    type("mine");
    await flush(AUTOSAVE_MS + 10);
    type("mine, and more");
    rerenderWith({ serverValue: "mine" });
    expect(editor()).toHaveValue("mine, and more");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a change from outside replaces the text and says so, only if there was unsaved typing", async () => {
    const { rerenderWith } = setup();
    rerenderWith({ serverValue: "from the agent" });
    expect(editor()).toHaveValue("from the agent");
    expect(screen.queryByRole("alert")).toBeNull();
    type("typing in progress");
    rerenderWith({ serverValue: "from the terminal" });
    expect(editor()).toHaveValue("from the terminal");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "changed while you were editing",
    );
  });
});
