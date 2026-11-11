"use client";

import { ErrorState } from "./error-state";

export type RouteErrorProps = {
  error: unknown;
  retry: () => void;
  title?: string;
  description?: string;
};

export function RouteError({ retry, title, description }: RouteErrorProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState title={title} description={description} onRetry={retry} />
    </div>
  );
}
