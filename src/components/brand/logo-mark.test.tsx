import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppIcon } from "./app-icon";
import { Logo } from "./logo";
import { LogoMark } from "./logo-mark";

describe("LogoMark", () => {
  test("draws one gradient V with a gradient unique to each instance", () => {
    const { container } = render(
      <>
        <LogoMark size={40} />
        <LogoMark size={40} />
      </>,
    );
    const [first, second] = container.querySelectorAll("svg");
    expect(first).toHaveAttribute("width", "40");
    expect(first).toHaveAttribute("aria-hidden", "true");
    expect(first.querySelectorAll("path")).toHaveLength(1);
    const firstId = first.querySelector("linearGradient")!.id;
    const secondId = second.querySelector("linearGradient")!.id;
    expect(firstId).not.toBe(secondId);
    expect(first.querySelector("path")).toHaveAttribute(
      "stroke",
      `url(#${firstId})`,
    );
  });

  test("is exposed as an image when titled", () => {
    render(<LogoMark title="Vibe" />);
    expect(screen.getByRole("img", { name: "Vibe" })).toBeInTheDocument();
  });
});

describe("Logo and AppIcon", () => {
  test("Logo renders the wordmark", () => {
    render(<Logo />);
    expect(screen.getByText("vibe")).toBeInTheDocument();
  });

  test("AppIcon scopes its theme through the variant class", () => {
    const { container } = render(<AppIcon variant="light" />);
    expect(container.firstChild).toHaveClass("light");
  });
});
