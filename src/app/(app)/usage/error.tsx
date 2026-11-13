"use client";
import {
  RouteError,
  type RouteErrorProps,
} from "@/components/states/route-error";
export default function Error(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Couldn't load usage"
      description="Something went wrong while loading your credits. Try again."
    />
  );
}
