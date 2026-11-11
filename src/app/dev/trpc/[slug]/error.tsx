"use client";

import { ErrorState } from "../_components/error-state";

export default function Error(props: { error: Error; reset: () => void }) {
  return <ErrorState {...props} />;
}
