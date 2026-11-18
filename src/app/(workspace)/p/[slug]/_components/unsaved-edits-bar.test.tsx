import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const calls = vi.hoisted(() => ({ save: vi.fn(), discard: vi.fn() }));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    code: {
      saveVersion: {
        mutationOptions: (o: object) => ({ mutationFn: calls.save, ...o }),
      },
      discard: {
        mutationOptions: (o: object) => ({ mutationFn: calls.discard, ...o }),
      },
    },
    version: { pathFilter: () => ({ queryKey: ["version"] }) },
    message: { pathFilter: () => ({ queryKey: ["message"] }) },
    project: { pathFilter: () => ({ queryKey: ["project"] }) },
  }),
}));

const { UnsavedEditsBar } = await import("./unsaved-edits-bar");

const setup = (locked = false) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UnsavedEditsBar projectId="p1" locked={locked} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  calls.save.mockReset().mockResolvedValue({ number: 3 });
  calls.discard.mockReset().mockResolvedValue({ discarded: true });
});

describe("UnsavedEditsBar", () => {
  test("saves the edits as a version", async () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("unsaved edits");
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(calls.save).toHaveBeenCalled());
    expect(calls.save.mock.calls[0][0]).toEqual({ projectId: "p1" });
  });

  test("asks before discarding, and discards only when confirmed", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(
      screen.getByRole("dialog", { name: "Discard your edits?" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(calls.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard edits" }));
    await waitFor(() => expect(calls.discard).toHaveBeenCalled());
    expect(calls.discard.mock.calls[0][0]).toEqual({ projectId: "p1" });
  });

  test("both actions are disabled while Vibe is building", () => {
    setup(true);
    expect(screen.getByRole("button", { name: "Save version" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
  });
});
