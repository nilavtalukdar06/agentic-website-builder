import { describe, expect, test } from "vitest";
import {
  decodeSnapshotFile,
  encodeBinaryFile,
  isBinaryPath,
  isBinarySnapshot,
  mimeTypeFor,
} from "./snapshot-files";

describe("snapshot files", () => {
  test("recognises binary paths and their types", () => {
    expect(isBinaryPath("public/hero.webp")).toBe(true);
    expect(isBinaryPath("app/page.tsx")).toBe(false);
    expect(mimeTypeFor("a/b.JPG")).toBe("image/jpeg");
    expect(mimeTypeFor("font.woff2")).toBe("font/woff2");
    expect(mimeTypeFor("x.zip")).toBe("application/octet-stream");
  });

  test("round-trips bytes through a data URL and leaves text alone", () => {
    const bytes = new Uint8Array([0, 255, 10, 13, 42]);
    const encoded = encodeBinaryFile("public/a.png", bytes);
    expect(encoded.startsWith("data:image/png;base64,")).toBe(true);
    expect(isBinarySnapshot(encoded)).toBe(true);
    expect(Array.from(decodeSnapshotFile(encoded) as Uint8Array)).toEqual([
      0, 255, 10, 13, 42,
    ]);
    expect(decodeSnapshotFile("export {}")).toBe("export {}");
    expect(isBinarySnapshot("data: not base64")).toBe(false);
  });
});
