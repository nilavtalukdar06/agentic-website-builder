import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  test("shows the message and retries", () => {
    const reset = vi.fn();
    render(<ErrorState error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
