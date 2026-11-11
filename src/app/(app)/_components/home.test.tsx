import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderWithQueryClient,
  resetTrpcHandlers,
  trpcHandlers,
} from "@/test/trpc";
import { NewProjectPrompt, promptSuggestions } from "./new-project-prompt";
import { RecentProjects } from "./recent-projects";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const toast = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@/trpc/client", async () => {
  const { trpcMock } = await import("@/test/trpc");
  return { useTRPC: () => trpcMock };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  resetTrpcHandlers();
  router.push.mockReset();
  toast.add.mockReset();
});

describe("NewProjectPrompt", () => {
  const textbox = () =>
    screen.getByRole("textbox", { name: "Describe the website to build" });
  const submit = () => screen.getByRole("button", { name: "Create project" });

  test("submit is disabled until there is a prompt", () => {
    renderWithQueryClient(<NewProjectPrompt />);
    expect(submit()).toBeDisabled();
    fireEvent.change(textbox(), { target: { value: "   " } });
    expect(submit()).toBeDisabled();
  });

  test("a suggestion fills the prompt", () => {
    renderWithQueryClient(<NewProjectPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurant menu" }));
    expect(textbox()).toHaveValue(promptSuggestions[2].prompt);
    expect(submit()).toBeEnabled();
  });

  test("creates the project and opens it", async () => {
    trpcHandlers["project.create"] = vi
      .fn()
      .mockResolvedValue({ id: "p1", slug: "coffee-site", name: "Coffee" });
    const { queryClient } = renderWithQueryClient(<NewProjectPrompt />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.change(textbox(), { target: { value: " A coffee site " } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/p/coffee-site"),
    );
    expect(trpcHandlers["project.create"]).toHaveBeenCalledWith({
      prompt: "A coffee site",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project"] });
  });

  test("keeps the prompt and shows a toast when creation fails", async () => {
    trpcHandlers["project.create"] = vi
      .fn()
      .mockRejectedValue(new Error("Database down"));
    renderWithQueryClient(<NewProjectPrompt />);
    fireEvent.change(textbox(), { target: { value: "A coffee site" } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          description: "Database down",
        }),
      ),
    );
    expect(textbox()).toHaveValue("A coffee site");
    expect(router.push).not.toHaveBeenCalled();
  });

  test("unbuilt controls are disabled", () => {
    renderWithQueryClient(<NewProjectPrompt />);
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Public/ })).toBeDisabled();
  });
});

describe("RecentProjects", () => {
  const project = (n: number) => ({
    id: String(n),
    slug: `site-${n}`,
    name: `Site ${n}`,
    description: null,
    githubRepo: n === 1 ? "me/site-1" : null,
    updatedAt: new Date(),
  });

  test("shows skeletons while loading", () => {
    trpcHandlers["project.recent"] = vi.fn(() => new Promise(() => {}));
    renderWithQueryClient(<RecentProjects />);
    expect(
      screen.getByRole("status", { name: "Loading projects" }),
    ).toBeInTheDocument();
  });

  test("renders up to six cards and a link to all projects", async () => {
    trpcHandlers["project.recent"] = vi
      .fn()
      .mockResolvedValue([project(1), project(2)]);
    renderWithQueryClient(<RecentProjects />);
    expect(await screen.findByRole("link", { name: /Site 1/ })).toHaveAttribute(
      "href",
      "/p/site-1",
    );
    expect(screen.getByText("On GitHub")).toBeInTheDocument();
    expect(screen.getAllByText("Edited just now")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "See all projects" }),
    ).toHaveAttribute("href", "/projects");
    expect(trpcHandlers["project.recent"]).toHaveBeenCalledWith({ limit: 6 });
  });

  test("has an empty state", async () => {
    trpcHandlers["project.recent"] = vi.fn().mockResolvedValue([]);
    renderWithQueryClient(<RecentProjects />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  test("shows an error with retry", async () => {
    trpcHandlers["project.recent"] = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([]);
    renderWithQueryClient(<RecentProjects />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your projects",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });
});

describe("NewProjectPrompt hydration", () => {
  test("keeps text typed before hydration", () => {
    const textarea = document.createElement("textarea");
    textarea.id = "new-project-prompt";
    textarea.value = "typed early";
    document.body.append(textarea);
    const getById = vi
      .spyOn(document, "getElementById")
      .mockReturnValueOnce(textarea);
    renderWithQueryClient(<NewProjectPrompt />);
    textarea.remove();
    getById.mockRestore();
    expect(
      screen.getByRole("textbox", { name: "Describe the website to build" }),
    ).toHaveValue("typed early");
    expect(
      screen.getByRole("button", { name: "Create project" }),
    ).toBeEnabled();
  });
});
