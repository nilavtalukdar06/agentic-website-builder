"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/states/route-error";
import { WorkspaceShell } from "./_components/workspace-shell";

export default function Error(props: RouteErrorProps) {
  return (
    <WorkspaceShell title="Project">
      <RouteError
        {...props}
        title="Couldn't open this project"
        description="Something went wrong while loading it. Try again."
      />
    </WorkspaceShell>
  );
}
