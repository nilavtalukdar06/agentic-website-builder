"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/states/route-error";

export default function Error(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Couldn't load the status"
      description="We couldn't read the latest health checks. Try again in a moment."
    />
  );
}
