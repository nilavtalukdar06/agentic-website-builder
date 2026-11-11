import { describe, expect, test } from "vitest";
import {
  attachmentName,
  checkAttachment,
  isAttachmentType,
  MAX_ATTACHMENT_BYTES,
} from "./attachments";

describe("checkAttachment", () => {
  test.each(["image/png", "image/jpeg", "image/webp", "image/gif"])(
    "accepts %s",
    (type) => {
      expect(checkAttachment({ type, size: 1000 })).toBeNull();
      expect(isAttachmentType(type)).toBe(true);
    },
  );

  test.each([
    [{ type: "image/svg+xml", size: 10 }, /Only PNG/],
    [{ type: "application/pdf", size: 10 }, /Only PNG/],
    [{ type: "image/png", size: 0 }, /empty/],
    [{ type: "image/png", size: MAX_ATTACHMENT_BYTES + 1 }, /4 MB/],
  ])("rejects %j", (file, message) => {
    expect(checkAttachment(file)).toMatch(message);
  });
});

describe("attachmentName", () => {
  test("strips control characters and caps the length", () => {
    expect(attachmentName("hero\u0000.png")).toBe("hero.png");
    expect(attachmentName("   ")).toBe("image");
    expect(attachmentName("a".repeat(200))).toHaveLength(120);
  });
});
