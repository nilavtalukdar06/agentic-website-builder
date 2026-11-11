"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/states/route-error";

export default function Error(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Couldn't load your projects"
      description="Something went wrong while loading this page. Try again."
    />
  );
}
