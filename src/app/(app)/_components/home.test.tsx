import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderWithQueryClient,
  resetTrpcHandlers,
  trpcHandlers,
} from "@/test/trpc";
import { NewProjectPrompt, promptSuggestions } from "./new-project-prompt";
import { RecentProjects } from "./recent-projects";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const toast = vi.hoisted(() => ({ add: vi.fn() }));
const upload = vi.hoisted(() => ({ uploadAttachment: vi.fn() }));

vi.mock("@/trpc/client", async () => {
  const { trpcMock } = await import("@/test/trpc");
  return { useTRPC: () => trpcMock };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/lib/upload-attachment", () => upload);

const sonnet = {
  id: "anthropic/claude-sonnet-5.5",
  name: "Claude Sonnet 5.5",
  provider: "anthropic",
  providerLabel: "Anthropic",
  vision: true,
  pricing: {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cachedInputPerMTok: null,
    cacheWritePerMTok: null,
  },
};
const glm = {
  ...sonnet,
  id: "zai/glm-5.3",
  name: "GLM 5.3",
  provider: "zai",
  providerLabel: "Z.ai",
  vision: false,
};

beforeEach(() => {
  resetTrpcHandlers();
  router.push.mockReset();
  toast.add.mockReset();
  upload.uploadAttachment.mockReset();
  trpcHandlers["model.list"] = vi
    .fn()
    .mockResolvedValue({ models: [sonnet, glm], defaultModelId: sonnet.id });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function attach(...files: File[]) {
  fireEvent.change(screen.getByLabelText("Upload files"), {
    target: { files },
  });
}

const image = (name = "ref.png") =>
  new File([new Uint8Array(10)], name, { type: "image/png" });

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
    await screen.findByRole("button", { name: /Change model/ });
    fireEvent.change(textbox(), { target: { value: " A coffee site " } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/p/coffee-site"),
    );
    expect(trpcHandlers["project.create"]).toHaveBeenCalledWith({
      prompt: "A coffee site",
      model: sonnet.id,
      attachmentIds: [],
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

  test("shows only the controls that work", () => {
    renderWithQueryClient(<NewProjectPrompt />);
    expect(screen.getByRole("button", { name: "Attach images" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Public|Next\.js/ }),
    ).not.toBeInTheDocument();
  });

  test("dictation is disabled in a browser without speech recognition", () => {
    renderWithQueryClient(<NewProjectPrompt />);
    expect(screen.getByRole("button", { name: "Dictate" })).toBeDisabled();
  });

  describe("dictation", () => {
    class FakeRecognition {
      static last: FakeRecognition | null = null;
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      start = () => this.onstart?.();
      stop = () => this.onend?.();
      abort = () => this.onend?.();
      constructor() {
        FakeRecognition.last = this;
      }
    }

    beforeEach(() => {
      (window as { SpeechRecognition?: unknown }).SpeechRecognition =
        FakeRecognition;
    });

    afterEach(() => {
      delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
      FakeRecognition.last = null;
    });

    test("speaking fills the prompt and enables Create project", async () => {
      renderWithQueryClient(<NewProjectPrompt />);
      expect(submit()).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
      act(() =>
        FakeRecognition.last?.onresult?.({
          results: [[{ transcript: "A coffee roastery site" }]],
        }),
      );
      expect(textbox()).toHaveValue("A coffee roastery site");
      expect(submit()).toBeEnabled();
    });

    test("a blocked microphone shows a toast", () => {
      renderWithQueryClient(<NewProjectPrompt />);
      fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
      act(() => FakeRecognition.last?.onerror?.({ error: "not-allowed" }));
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Voice input",
          description: expect.stringMatching(/Microphone access is blocked/),
        }),
      );
    });
  });

  test("the model chip shows the default and switches models", async () => {
    trpcHandlers["project.create"] = vi
      .fn()
      .mockResolvedValue({ id: "p1", slug: "coffee-site", name: "Coffee" });
    renderWithQueryClient(<NewProjectPrompt />);
    const chip = await screen.findByRole("button", {
      name: "Model: Claude Sonnet 5.5. Change model",
    });
    expect(
      chip
        .querySelector('[data-slot="model-logo"]')
        ?.getAttribute("data-provider"),
    ).toBe("anthropic");
    fireEvent.click(chip);
    expect(await screen.findByText("Z.ai")).toBeInTheDocument();
    expect(screen.getAllByText("$2 / $10 per 1M tokens")).toHaveLength(2);
    const logos = screen
      .getAllByRole("option")
      .map((option) =>
        option
          .querySelector('[data-slot="model-logo"]')
          ?.getAttribute("data-provider"),
      );
    expect(logos).toEqual(["anthropic", "zai"]);
    fireEvent.click(screen.getByRole("option", { name: /GLM 5\.3/ }));
    expect(
      await screen.findByRole("button", {
        name: "Model: GLM 5.3. Change model",
      }),
    ).toBeInTheDocument();
    fireEvent.change(textbox(), { target: { value: "A coffee site" } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(trpcHandlers["project.create"]).toHaveBeenCalledWith({
        prompt: "A coffee site",
        model: glm.id,
        attachmentIds: [],
      }),
    );
  });

  test("offers a retry when the model list fails", async () => {
    trpcHandlers["model.list"] = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue({ models: [sonnet], defaultModelId: sonnet.id });
    renderWithQueryClient(<NewProjectPrompt />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Models unavailable/ }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Model: Claude Sonnet 5.5. Change model",
      }),
    ).toBeInTheDocument();
  });

  test("uploads attached images before creating the project", async () => {
    upload.uploadAttachment.mockResolvedValue({
      id: "a1",
      name: "ref.png",
      contentType: "image/png",
      size: 10,
    });
    trpcHandlers["project.create"] = vi
      .fn()
      .mockResolvedValue({ id: "p1", slug: "coffee-site", name: "Coffee" });
    renderWithQueryClient(<NewProjectPrompt />);
    await screen.findByRole("button", { name: /Change model/ });
    attach(image());
    expect(await screen.findByText("ref.png")).toBeInTheDocument();
    fireEvent.change(textbox(), { target: { value: "Match this" } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(trpcHandlers["project.create"]).toHaveBeenCalledWith({
        prompt: "Match this",
        model: sonnet.id,
        attachmentIds: ["a1"],
      }),
    );
    expect(upload.uploadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "ref.png", mediaType: "image/png" }),
    );
  });

  test("rejects files that aren't images", async () => {
    renderWithQueryClient(<NewProjectPrompt />);
    attach(new File(["x"], "notes.txt", { type: "text/plain" }));
    await waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Only PNG, JPEG, WebP and GIF images can be attached.",
        }),
      ),
    );
  });

  test("blocks images for a model that can't read them", async () => {
    trpcHandlers["project.create"] = vi.fn();
    renderWithQueryClient(<NewProjectPrompt />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Change model/ }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /GLM 5\.3/ }));
    attach(image());
    fireEvent.change(textbox(), { target: { value: "Match this" } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: "GLM 5.3 can't read images" }),
      ),
    );
    expect(upload.uploadAttachment).not.toHaveBeenCalled();
    expect(trpcHandlers["project.create"]).not.toHaveBeenCalled();
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
