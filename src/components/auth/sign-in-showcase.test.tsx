import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SignInShowcase, showcasePrompts } from "./sign-in-showcase";

describe("SignInShowcase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });
  afterEach(() => vi.useRealTimers());

  test("types the first example prompt over the gradient", () => {
    const { container } = render(<SignInShowcase />);
    expect(container.querySelector("[data-slot='aurora']")).not.toBeNull();
    for (let i = 0; i < showcasePrompts[0].length; i++) {
      act(() => vi.advanceTimersByTime(45));
    }
    expect(
      screen.getByRole("status", { name: "Example prompt" }),
    ).toHaveTextContent(showcasePrompts[0]);
  });
});
