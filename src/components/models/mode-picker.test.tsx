import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ModePicker } from "./mode-picker";

describe("ModePicker", () => {
  test("shows the current mode on the trigger", () => {
    render(<ModePicker value="standard" onChange={() => {}} />);
    const trigger = screen.getByRole("combobox", {
      name: "Mode: Standard. Change mode",
    });
    expect(trigger).toHaveTextContent("Standard");
  });

  test("picking Fast reports the fast mode", async () => {
    const onChange = vi.fn();
    render(<ModePicker value="standard" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: /Change mode/ }));
    const fast = await screen.findByRole("option", { name: /Fast/ });
    fireEvent.pointerDown(fast, { pointerType: "mouse" });
    fireEvent.mouseDown(fast);
    fireEvent.pointerUp(fast, { pointerType: "mouse" });
    fireEvent.mouseUp(fast);
    fireEvent.click(fast);
    expect(onChange).toHaveBeenCalledWith("fast");
  });

  test("can be disabled", () => {
    render(<ModePicker value="fast" onChange={() => {}} disabled />);
    expect(
      screen.getByRole("combobox", { name: "Mode: Fast. Change mode" }),
    ).toBeDisabled();
  });
});
