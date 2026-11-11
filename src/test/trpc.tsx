import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";

type Handler = (input?: unknown) => Promise<unknown>;

export const trpcHandlers: Record<
  string,
  ReturnType<typeof vi.fn<Handler>>
> = {};

function handler(path: string) {
  trpcHandlers[path] ??= vi.fn<Handler>();
  return trpcHandlers[path];
}

function query(path: string) {
  return {
    queryOptions: (input?: unknown) => ({
      queryKey: [path, input],
      queryFn: () => handler(path)(input),
    }),
  };
}

export const trpcMock = {
  project: {
    list: query("project.list"),
    recent: query("project.recent"),
    create: {
      mutationOptions: (options: object = {}) => ({
        mutationFn: (input: unknown) => handler("project.create")(input),
        ...options,
      }),
    },
    pathFilter: () => ({ queryKey: ["project"] }),
  },
  credits: { balance: query("credits.balance") },
};

export function resetTrpcHandlers() {
  for (const key of Object.keys(trpcHandlers)) delete trpcHandlers[key];
}

export function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}
