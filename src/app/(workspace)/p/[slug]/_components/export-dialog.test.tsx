import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ExportDialog } from "./export-dialog";
import type { GithubExportState } from "./use-github-export";

const linkSocial = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({ authClient: { linkSocial } }));
type Data = NonNullable<GithubExportState["status"]["data"]>;
type Job = NonNullable<Data["job"]>;
const job: Job = {
  id: "e1",
  status: "QUEUED",
  attempt: 1,
  name: "demo",
  private: true,
  versionNumber: 2,
  repository: null,
  repositoryUrl: null,
  commitSha: null,
  error: null,
  errorCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
beforeEach(() => {
  vi.clearAllMocks();
  linkSocial.mockResolvedValue({ error: null });
});
function buildState(options: {
  pending?: boolean;
  loadError?: boolean;
  active?: boolean;
  data?: Partial<Data>;
}) {
  return {
    status: {
      isPending: !!options.pending,
      isError: !!options.loadError,
      data: {
        job: null,
        githubRepo: null,
        hasVersion: true,
        busy: null,
        permissions: { public: true, private: true },
        ...options.data,
      },
      refetch: vi.fn(),
    },
    active: !!options.active,
    pending: false,
    start: { mutate: vi.fn(), error: null },
    retry: { mutate: vi.fn(), error: null },
  } as unknown as GithubExportState;
}
function show(
  options: {
    open?: boolean;
    pending?: boolean;
    loadError?: boolean;
    active?: boolean;
    data?: Partial<Data>;
  } = {},
) {
  const state = buildState(options);
  render(
    <ExportDialog
      open={options.open ?? true}
      onOpenChange={vi.fn()}
      projectId="p1"
      slug="demo"
      building={false}
      oauthError={false}
      state={state}
    />,
  );
  return state;
}
test("closed export dialogs mount no modal content", () => {
  show({ open: false });
  expect(screen.queryByRole("dialog")).toBeNull();
});
test("loading is a skeleton shaped like the export form", () => {
  show({ pending: true });
  expect(
    screen
      .getByLabelText("Loading export options")
      .querySelectorAll('[data-slot="skeleton"]'),
  ).toHaveLength(4);
});
test("failed option fetches have an explicit retry", () => {
  const state = show({ loadError: true });
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(state.status.refetch).toHaveBeenCalledOnce();
});
test("an empty project explains why it cannot export", () => {
  show({ data: { hasVersion: false } });
  expect(screen.getByText("No complete version yet")).toBeInTheDocument();
  expect(screen.queryByLabelText("Repository name")).toBeNull();
});
test("invalid repository names stay out of the mutation", () => {
  const state = show();
  fireEvent.change(screen.getByLabelText("Repository name"), {
    target: { value: "bad/name" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create repository and export" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Use letters");
  expect(state.start.mutate).not.toHaveBeenCalled();
});
test("private is the default and public requests only public repository access", async () => {
  show({ data: { permissions: { public: false, private: false } } });
  expect(screen.getByRole("button", { name: "Private" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Public" }));
  fireEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));
  await waitFor(() =>
    expect(linkSocial).toHaveBeenCalledWith({
      provider: "github",
      scopes: ["public_repo"],
      callbackURL: "/p/demo?export=true",
      errorCallbackURL: "/p/demo?export=true&exportError=true",
    }),
  );
});
test("active jobs show persisted progress and no success", () => {
  show({ active: true, data: { job: { ...job, status: "RECOVERING" } } });
  expect(screen.getByRole("status")).toHaveTextContent("Waking up the sandbox");
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "35",
  );
  expect(screen.queryByText("Pushed to GitHub")).toBeNull();
});
test("a finished export closes the dialog on its own", () => {
  vi.useFakeTimers();
  try {
    const onOpenChange = vi.fn();
    const active = { ...job, status: "PUSHING" as const };
    const { rerender } = render(
      <ExportDialog
        open
        onOpenChange={onOpenChange}
        projectId="p1"
        slug="demo"
        building={false}
        oauthError={false}
        state={buildState({ active: true, data: { job: active } })}
      />,
    );
    rerender(
      <ExportDialog
        open
        onOpenChange={onOpenChange}
        projectId="p1"
        slug="demo"
        building={false}
        oauthError={false}
        state={buildState({
          active: false,
          data: {
            githubRepo: "owner/demo",
            job: { ...active, status: "SUCCEEDED" },
          },
        })}
      />,
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  } finally {
    vi.useRealTimers();
  }
});
test("retry uses the existing failed job", () => {
  const state = show({
    data: { job: { ...job, status: "FAILED", error: "Try again." } },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry export" }));
  expect(state.retry.mutate).toHaveBeenCalledWith({
    projectId: "p1",
    exportId: "e1",
  });
});
test("persisted success links to the repository and keeps its name fixed for re-export", () => {
  show({
    data: {
      githubRepo: "owner/demo",
      job: {
        ...job,
        status: "SUCCEEDED",
        repository: "owner/demo",
        repositoryUrl: "https://github.com/owner/demo",
        commitSha: "0123456789",
      },
    },
  });
  expect(screen.getByText("Pushed to GitHub")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "owner/demo" })).toHaveAttribute(
    "href",
    "https://github.com/owner/demo",
  );
  expect(screen.getByLabelText("Repository name")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Push latest version" }),
  ).toBeEnabled();
});
