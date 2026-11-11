"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/states/route-error";

export default function Error(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      description="We couldn't load this page. Try again."
    />
  );
}
