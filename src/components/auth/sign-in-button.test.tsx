import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SignInButton } from "./sign-in-button";

const social = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social } },
}));

vi.mock("@/components/ui/toast", () => ({ toast: { add: toastAdd } }));

describe("SignInButton", () => {
  beforeEach(() => {
    social.mockReset();
    toastAdd.mockReset();
  });

  test("starts GitHub sign-in with the callback and shows the pending state", async () => {
    social.mockReturnValue(new Promise(() => {}));
    render(<SignInButton callbackURL="/projects" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    expect(social).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/projects",
      errorCallbackURL: "/sign-in",
    });
    const button = await screen.findByRole("button", {
      name: "Redirecting to GitHub…",
    });
    expect(button).toBeDisabled();
  });

  test("shows a toast and re-enables the button on failure", async () => {
    social.mockResolvedValue({ error: { message: "Network down" } });
    render(<SignInButton callbackURL="/" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    expect(
      await screen.findByRole("button", { name: "Continue with GitHub" }),
    ).toBeEnabled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", description: "Network down" }),
    );
  });
});
