// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));

const { staleFiles } = await import("./workspace");

describe("staleFiles", () => {
  test("lists source files that the restored version doesn't have", () => {
    const listing = [
      "120\t./app/page.tsx",
      "80\t./components/old.tsx",
      "30\t./public/logo.png",
    ].join("\n");
    expect(
      staleFiles(listing, {
        "app/page.tsx": "x",
        "public/logo.png": "data:image/png;base64,AA==",
      }),
    ).toEqual(["components/old.tsx"]);
  });
});
