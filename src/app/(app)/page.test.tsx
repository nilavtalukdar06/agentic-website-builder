import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Home from "./page";

vi.mock("@/server/session", () => ({
  requireSession: vi.fn().mockResolvedValue({
    user: { id: "u1", name: "Ada Lovelace", image: null },
  }),
}));

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

test("shows the signed-in user and a sign-out control", async () => {
  render(await Home());
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("AL")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});
