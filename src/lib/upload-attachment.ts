import type { FileUIPart } from "ai";

export type UploadedAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

export async function uploadAttachment(
  file: Pick<FileUIPart, "url" | "filename" | "mediaType">,
): Promise<UploadedAttachment> {
  const blob = await (await fetch(file.url)).blob();
  const form = new FormData();
  form.set(
    "file",
    new File([blob], file.filename || "image", {
      type: file.mediaType || blob.type,
    }),
  );
  const response = await fetch("/api/attachments", {
    method: "POST",
    body: form,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "Couldn't upload the image.";
    throw new Error(message);
  }
  return body as UploadedAttachment;
}
