import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CreditsCard } from "./credits-card";

describe("CreditsCard", () => {
  test("formats the balance and links to top up", () => {
    render(<CreditsCard balance={1198} allowance={2000} />);
    expect(screen.getByText("1,198")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Top up" })).toHaveAttribute(
      "href",
      "/usage",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "59.9",
    );
  });

  test("clamps progress and flags an empty balance", () => {
    render(<CreditsCard balance={0} allowance={0} topUpHref="/usage?top-up" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByText("0").parentElement).toHaveClass("text-destructive");
  });
});
