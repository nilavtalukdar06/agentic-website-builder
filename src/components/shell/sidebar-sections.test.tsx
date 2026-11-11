import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  renderWithQueryClient,
  resetTrpcHandlers,
  trpcHandlers,
} from "@/test/trpc";
import { SidebarCredits } from "./sidebar-credits";
import { SidebarRecentProjects } from "./sidebar-recent-projects";

vi.mock("@/trpc/client", async () => {
  const { trpcMock: mock } = await import("@/test/trpc");
  return { useTRPC: () => mock };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/p/lumen" }));

const inSidebar = (ui: React.ReactElement) =>
  renderWithQueryClient(<SidebarProvider>{ui}</SidebarProvider>);

beforeEach(() => {
  resetTrpcHandlers();
});

describe("SidebarRecentProjects", () => {
  test("shows skeletons while loading", () => {
    trpcHandlers["project.recent"] = vi.fn(() => new Promise(() => {}));
    inSidebar(<SidebarRecentProjects />);
    expect(
      screen.getByRole("status", { name: "Loading recent projects" }),
    ).toBeInTheDocument();
  });

  test("lists projects, marks the open one and links to more", async () => {
    trpcHandlers["project.recent"] = vi.fn().mockResolvedValue([
      { id: "1", name: "Ember & Oak", slug: "ember" },
      { id: "2", name: "Lumen", slug: "lumen" },
    ]);
    inSidebar(<SidebarRecentProjects />);
    const lumen = await screen.findByRole("link", { name: "Lumen" });
    expect(lumen).toHaveAttribute("href", "/p/lumen");
    expect(lumen).toHaveAttribute("data-active");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(trpcHandlers["project.recent"]).toHaveBeenCalledWith({ limit: 4 });
  });

  test("has an empty state", async () => {
    trpcHandlers["project.recent"] = vi.fn().mockResolvedValue([]);
    inSidebar(<SidebarRecentProjects />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "More" })).toBeNull();
  });

  test("shows an error with retry", async () => {
    trpcHandlers["project.recent"] = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([]);
    inSidebar(<SidebarRecentProjects />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });
});

describe("SidebarCredits", () => {
  test("shows a skeleton while loading", () => {
    trpcHandlers["credits.balance"] = vi.fn(() => new Promise(() => {}));
    inSidebar(<SidebarCredits />);
    expect(
      screen.getByRole("status", { name: "Loading credits" }),
    ).toBeInTheDocument();
  });

  test("renders the balance against credits granted", async () => {
    trpcHandlers["credits.balance"] = vi
      .fn()
      .mockResolvedValue({ balance: 1198, granted: 2000 });
    inSidebar(<SidebarCredits />);
    expect(await screen.findByText("1,198")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "59.9",
    );
  });

  test("shows an error with retry", async () => {
    trpcHandlers["credits.balance"] = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ balance: 5, granted: 5 });
    inSidebar(<SidebarCredits />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your balance.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
  });
});
