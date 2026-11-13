import { describe, expect, test } from "vitest";
import { isBinarySnapshotValue, snapshotBytes } from "./download";

describe("snapshotBytes", () => {
  test("text stays text and data URLs become bytes", () => {
    expect(snapshotBytes("hello")).toBe("hello");
    expect(snapshotBytes("data:image/png;base64,AQID")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(isBinarySnapshotValue("data:image/png;base64,AQID")).toBe(true);
    expect(isBinarySnapshotValue("export {}")).toBe(false);
  });
});
