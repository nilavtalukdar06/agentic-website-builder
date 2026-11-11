import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Home from "./page";

vi.mock("@/trpc/server", () => ({
  getQueryClient: () => ({
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
  }),
  HydrateClient: ({ children }: { children: React.ReactNode }) => children,
  trpc: {
    project: { recent: { queryOptions: (input: unknown) => ({ input }) } },
  },
}));

vi.mock("./_components/new-project-prompt", () => ({
  NewProjectPrompt: () => <form aria-label="New project prompt" />,
}));

vi.mock("./_components/recent-projects", () => ({
  RecentProjects: () => <section aria-label="Recent projects" />,
}));

test("renders the heading, prompt and recent projects", async () => {
  render(await Home());
  expect(
    screen.getByRole("heading", { name: "What should we build today?" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("form", { name: "New project prompt" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Recent projects" }),
  ).toBeInTheDocument();
});
