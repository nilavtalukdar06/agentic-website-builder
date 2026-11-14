import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

const wake = vi.hoisted(() => vi.fn());
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    sandbox: { wake: { mutationOptions: () => ({ mutationFn: wake }) } },
  }),
}));
import { usePreview } from "./use-preview";

describe("usePreview", () => {
  test("wakes again after a restored version replaces the current one", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    wake
      .mockReset()
      .mockResolvedValueOnce({
        status: "ready",
        previewUrl: "https://old.e2b.app",
      })
      .mockResolvedValueOnce({
        status: "ready",
        previewUrl: "https://recovered.e2b.app",
      });
    const { result, rerender } = renderHook(
      ({ version }) =>
        usePreview({
          projectId: "p1",
          building: false,
          version,
          savedPreviewUrl: null,
          livePreviewUrl: null,
        }),
      {
        initialProps: { version: 2 },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.url).toBe("https://old.e2b.app"));
    rerender({ version: 3 });
    await waitFor(() =>
      expect(result.current.url).toBe("https://recovered.e2b.app"),
    );
    expect(wake).toHaveBeenCalledTimes(2);
    expect(result.current.reloadKey).toBeGreaterThan(0);
  });
});
