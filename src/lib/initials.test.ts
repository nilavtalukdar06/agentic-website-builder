import { expect, test } from "vitest";
import { initials } from "./initials";

test("initials", () => {
  expect(initials("Nilav")).toBe("N");
  expect(initials("Nilav Talukdar Dev")).toBe("NT");
  expect(initials("  ")).toBe("?");
});
