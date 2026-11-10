import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppIcon } from "./app-icon";
import { Logo } from "./logo";
import { LogoMark } from "./logo-mark";

describe("LogoMark", () => {
  test("draws two currentColor strokes with the second at 50% opacity", () => {
    const { container } = render(<LogoMark size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const paths = svg.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute("opacity", "0.5");
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
