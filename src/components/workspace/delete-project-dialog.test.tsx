import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DeleteProjectDialog } from "./delete-project-dialog";

function setup(props: Partial<Parameters<typeof DeleteProjectDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <DeleteProjectDialog
      open
      onOpenChange={onOpenChange}
      projectName="Expense tracker"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
}

const deleteButton = () => screen.getByRole("button", { name: /^Delete/ });
const nameInput = () => screen.getByLabelText(/to confirm/);

describe("DeleteProjectDialog", () => {
  test("keeps Delete disabled until the exact name is typed", () => {
    const { onConfirm } = setup();
    expect(deleteButton()).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: "expense tracker" } });
    expect(deleteButton()).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: "Expense tracker" } });
    expect(deleteButton()).toBeEnabled();
    fireEvent.click(deleteButton());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test("does not confirm on Enter while the name is wrong", () => {
    const { onConfirm } = setup();
    fireEvent.change(nameInput(), { target: { value: "nope" } });
    fireEvent.submit(nameInput());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("Cancel closes without confirming", () => {
    const { onConfirm, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("blocks deletion with a reason while the project is busy", () => {
    setup({
      blockedReason: "Wait for the current build or operation to finish.",
    });
    fireEvent.change(nameInput(), { target: { value: "Expense tracker" } });
    expect(deleteButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Wait for the current",
    );
  });

  test("shows the server error", () => {
    setup({ error: "Wait for the current build to finish, or stop it first." });
    expect(screen.getByText(/stop it first/)).toBeInTheDocument();
  });

  test("shows progress and can't be dismissed while deleting", () => {
    setup({ pending: true });
    expect(screen.getByRole("button", { name: /Deleting/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
