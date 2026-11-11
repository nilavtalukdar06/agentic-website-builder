import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient } from "@trpc/client";
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, test, vi } from "vitest";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { TRPCProvider } from "@/trpc/client";
import { ProjectList } from "./project-list";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderWithData(data: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const trpcClient = createTRPCClient<AppRouter>({ links: [] });
  queryClient.setQueryData(
    [["dev", "project", "list"], { type: "query" }],
    data,
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Suspense fallback="loading">
          <ProjectList />
        </Suspense>
      </TRPCProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectList", () => {
  test("renders an explicit empty state", async () => {
    renderWithData([]);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  test("renders a card per project", async () => {
    renderWithData([
      {
        id: "p1",
        slug: "demo-landing",
        name: "Demo landing page",
        description: "Seeded",
        githubRepo: null,
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    expect(await screen.findByText("Demo landing page")).toBeInTheDocument();
    expect(screen.getByText("Edited 2026-01-02")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/dev/trpc/demo-landing",
    );
  });
});
