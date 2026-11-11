import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import ContactPage from "./page";

describe("ContactPage", () => {
  test("lists every channel with the right destination", () => {
    render(<ContactPage />);
    const expected: Record<string, string> = {
      "Email: nilavtalukdar9@gmail.com": "mailto:nilavtalukdar9@gmail.com",
      "Instagram: @nilav.talukdar": "https://www.instagram.com/nilav.talukdar",
      "LinkedIn: Nilav Talukdar": "https://www.linkedin.com/in/nilav-talukdar",
      "GitHub: @nilavtalukdar06": "https://github.com/nilavtalukdar06",
    };
    for (const [name, href] of Object.entries(expected)) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  test("opens external profiles safely in a new tab", () => {
    render(<ContactPage />);
    const link = screen.getByRole("link", { name: /^GitHub/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /^Email/ })).not.toHaveAttribute(
      "target",
    );
  });
});
