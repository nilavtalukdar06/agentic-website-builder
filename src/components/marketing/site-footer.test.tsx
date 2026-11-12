import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CONTACT_EMAIL } from "@/lib/contact";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  test("shows only the contact email", () => {
    render(<SiteFooter />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    expect(links[0]).toHaveTextContent(CONTACT_EMAIL);
  });
});
