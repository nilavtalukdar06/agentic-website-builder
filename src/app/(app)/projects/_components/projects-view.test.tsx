import { fireEvent, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderWithQueryClient,
  resetTrpcHandlers,
  trpcHandlers,
} from "@/test/trpc";
import { projectCountLabel, ProjectsView } from "./projects-view";

vi.mock("@/trpc/client", async () => {
  const { trpcMock } = await import("@/test/trpc");
  return { useTRPC: () => trpcMock };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/projects",
}));

const project = (name: string, githubRepo: string | null = null) => ({
  id: name,
  slug: name.toLowerCase(),
  name,
  description: `${name} description`,
  githubRepo,
  updatedAt: new Date(),
});

function renderView(searchParams = "") {
  const onUrlUpdate = vi.fn();
  const Wrapper = withNuqsTestingAdapter({ searchParams, onUrlUpdate });
  renderWithQueryClient(
    <Wrapper>
      <ProjectsView />
    </Wrapper>,
  );
  return { onUrlUpdate };
}

beforeEach(() => {
  resetTrpcHandlers();
});

describe("projectCountLabel", () => {
  test("pluralises", () => {
    expect(projectCountLabel(1)).toBe(
      "1 project, each running in its own sandbox.",
    );
    expect(projectCountLabel(12)).toBe(
      "12 projects, each running in its own sandbox.",
    );
  });
});

describe("ProjectsView", () => {
  test("lists projects with the total", async () => {
    trpcHandlers["project.list"] = vi.fn().mockResolvedValue({
      projects: [project("Lumen", "me/lumen"), project("Forge")],
      total: 2,
    });
    renderView();
    expect(await screen.findByRole("link", { name: /Lumen/ })).toHaveAttribute(
      "href",
      "/p/lumen",
    );
    expect(
      screen.getByText("2 projects, each running in its own sandbox."),
    ).toBeInTheDocument();
    expect(trpcHandlers["project.list"]).toHaveBeenCalledWith({
      q: "",
      filter: "all",
      sort: "edited",
    });
  });

  test("reads filters from the URL", async () => {
    trpcHandlers["project.list"] = vi.fn().mockResolvedValue({
      projects: [project("Lumen", "me/lumen")],
      total: 3,
    });
    renderView("?q=lu&filter=github&sort=name");
    await screen.findByRole("link", { name: /Lumen/ });
    expect(trpcHandlers["project.list"]).toHaveBeenCalledWith({
      q: "lu",
      filter: "github",
      sort: "name",
    });
    expect(
      screen.getByRole("searchbox", { name: "Search projects" }),
    ).toHaveValue("lu");
    expect(screen.getByRole("tab", { name: "On GitHub" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("switching the filter updates the URL", async () => {
    trpcHandlers["project.list"] = vi
      .fn()
      .mockResolvedValue({ projects: [project("Forge")], total: 1 });
    const { onUrlUpdate } = renderView();
    await screen.findByRole("link", { name: /Forge/ });
    fireEvent.click(screen.getByRole("tab", { name: "Not exported" }));
    await waitFor(() =>
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ queryString: "?filter=local" }),
      ),
    );
  });

  test("shows the no-projects empty state", async () => {
    trpcHandlers["project.list"] = vi
      .fn()
      .mockResolvedValue({ projects: [], total: 0 });
    renderView();
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  test("shows the no-match empty state and clears filters", async () => {
    trpcHandlers["project.list"] = vi
      .fn()
      .mockResolvedValue({ projects: [], total: 4 });
    const { onUrlUpdate } = renderView("?q=zzz&filter=github");
    expect(await screen.findByText("No projects match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ queryString: "" }),
      ),
    );
  });

  test("shows an error with retry", async () => {
    trpcHandlers["project.list"] = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ projects: [project("Forge")], total: 1 });
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your projects",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Forge/ })).toBeVisible();
  });
});
