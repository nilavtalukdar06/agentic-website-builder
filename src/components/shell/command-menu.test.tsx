import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderWithQueryClient,
  resetTrpcHandlers,
  trpcHandlers,
} from "@/test/trpc";
import { CommandMenu } from "./command-menu";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/trpc/client", async () => {
  const { trpcMock } = await import("@/test/trpc");
  return { useTRPC: () => trpcMock };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/projects",
}));

beforeEach(() => {
  resetTrpcHandlers();
  router.push.mockReset();
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("CommandMenu", () => {
  test("⌘K opens it and a project can be opened", async () => {
    trpcHandlers["project.list"] = vi.fn().mockResolvedValue({
      projects: [{ id: "1", name: "Gamma site", slug: "gamma" }],
      total: 1,
    });
    renderWithQueryClient(<CommandMenu />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Usage & credits")).toBeInTheDocument();
    expect(screen.queryByText("Templates")).toBeNull();
    fireEvent.click(await screen.findByText("Gamma site"));
    expect(router.push).toHaveBeenCalledWith("/p/gamma");
  });

  test("New project goes home", async () => {
    trpcHandlers["project.list"] = vi
      .fn()
      .mockResolvedValue({ projects: [], total: 0 });
    renderWithQueryClient(<CommandMenu />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("New project"));
    expect(router.push).toHaveBeenCalledWith("/");
  });
});
