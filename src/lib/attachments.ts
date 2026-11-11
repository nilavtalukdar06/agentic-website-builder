export const ATTACHMENT_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type AttachmentType = keyof typeof ATTACHMENT_TYPES;

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",");
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export function isAttachmentType(type: string): type is AttachmentType {
  return Object.hasOwn(ATTACHMENT_TYPES, type);
}

export function checkAttachment(file: { type: string; size: number }) {
  if (!isAttachmentType(file.type)) {
    return "Only PNG, JPEG, WebP and GIF images can be attached.";
  }
  if (file.size === 0) return "The image is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Images must be 4 MB or smaller.";
  }
  return null;
}

export function attachmentName(name: string) {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "image").slice(0, 120);
}
