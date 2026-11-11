import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  test("links to docs, status and contact", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute(
      "href",
      "/status",
    );
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});
