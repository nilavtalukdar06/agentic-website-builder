import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FileChip } from "./file-chip";
import { formatElapsed, GeneratingOverlay } from "./generating-overlay";

describe("FileChip", () => {
  test("shows the path with a matching file icon", () => {
    const { container } = render(<FileChip path="lib/utils.ts" />);
    expect(screen.getByText("lib/utils.ts")).toBeInTheDocument();
    expect(container.querySelector("[data-kind='typescript']")).not.toBeNull();
  });

  test("shows added lines only when present", () => {
    const { rerender } = render(<FileChip path="a.tsx" addedLines={83} />);
    expect(screen.getByText("+83")).toBeInTheDocument();
    rerender(<FileChip path="a.tsx" />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});

describe("GeneratingOverlay", () => {
  test("formatElapsed renders m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(43)).toBe("0:43");
    expect(formatElapsed(125.9)).toBe("2:05");
    expect(formatElapsed(-4)).toBe("0:00");
  });

  test("lists files and the elapsed time", () => {
    render(
      <GeneratingOverlay
        elapsedSeconds={43}
        files={[
          { path: "lib/utils.ts", verb: "Edited", status: "done" },
          { path: "components/footer.tsx", verb: "Creating", status: "active" },
        ]}
      />,
    );
    expect(
      screen.getByText("Creating components/footer.tsx. 1 file done."),
    ).toHaveAttribute("role", "status");
    expect(screen.getByText("components/footer.tsx")).toBeInTheDocument();
    expect(screen.getByText("0:43")).toBeInTheDocument();
  });
});
