import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const invalidate = vi.hoisted(() => vi.fn());

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    version: { pathFilter: () => ({ queryKey: ["version"] }) },
  }),
}));

const { MAX_TERMINAL_CHARS, UserTerminal } = await import("./user-terminal");

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const fetchMock = vi.fn();

function setup(locked = false) {
  const client = new QueryClient();
  client.invalidateQueries = invalidate;
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <UserTerminal projectId="p1" locked={locked} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const input = () => screen.getByLabelText("Terminal command");
async function run(command: string) {
  fireEvent.change(input(), { target: { value: command } });
  await act(async () => {
    fireEvent.submit(input().closest("form")!);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  invalidate.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserTerminal", () => {
  test("explains what it is, then runs a command and streams its output", async () => {
    fetchMock.mockResolvedValue(
      new Response(streamOf("added 1 package\n", "\n[exit 0]\n"), {
        status: 200,
      }),
    );
    setup();
    expect(screen.getByText(/Run commands in your project/)).toBeVisible();
    await run("npm install zod");
    expect(fetchMock).toHaveBeenCalledWith("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "p1", command: "npm install zod" }),
    });
    expect(screen.getByText(/\$ npm install zod/)).toBeVisible();
    expect(screen.getByText(/added 1 package/)).toBeVisible();
    expect(screen.getByText(/\[exit 0\]/)).toBeVisible();
    expect(input()).toHaveValue("");
    expect(invalidate).toHaveBeenCalled();
  });

  test("shows the server's reason when a command is refused", async () => {
    fetchMock.mockResolvedValue(
      new Response("Command blocked: sudo is not available.", { status: 400 }),
    );
    setup();
    await run("sudo ls");
    expect(
      screen.getByText(/Command blocked: sudo is not available\./),
    ).toBeVisible();
  });

  test("tells the user when the connection fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    setup();
    await run("ls");
    expect(screen.getByText(/Couldn't reach the terminal/)).toBeVisible();
  });

  test("is locked while Vibe builds: it can't be typed into or submitted", async () => {
    setup(true);
    expect(input()).toBeDisabled();
    expect(input()).toHaveAttribute(
      "placeholder",
      "Locked while Vibe is building",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("ArrowUp and ArrowDown walk through earlier commands", async () => {
    fetchMock.mockImplementation(async () => new Response(streamOf("ok\n")));
    setup();
    await run("ls");
    await run("pwd");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input()).toHaveValue("pwd");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input()).toHaveValue("ls");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).toHaveValue("pwd");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).toHaveValue("");
  });

  test("ignores empty commands, clears the output and closes", async () => {
    fetchMock.mockImplementation(async () => new Response(streamOf("hello\n")));
    const { onClose } = setup();
    await run("   ");
    expect(fetchMock).not.toHaveBeenCalled();
    await run("echo hello");
    expect(screen.getByText(/hello/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear the output" }));
    expect(screen.queryByText(/hello/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close the terminal" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("keeps only the most recent output", async () => {
    fetchMock.mockResolvedValue(
      new Response(streamOf("a".repeat(MAX_TERMINAL_CHARS), "END")),
    );
    setup();
    await run("yes");
    const text = document.querySelector("pre")!.textContent!;
    expect(text.length).toBeLessThanOrEqual(MAX_TERMINAL_CHARS);
    expect(text.endsWith("END")).toBe(true);
  });
});
