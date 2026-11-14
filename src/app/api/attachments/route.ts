import { nanoid } from "nanoid";
import {
  attachmentName,
  checkAttachment,
  isAttachmentType,
} from "@/lib/attachments";
import { db } from "@/server/db";
import { consumeRateLimit, rateRules } from "@/server/rate-limit";
import { getSession } from "@/server/session";
import { attachmentKey, storeAttachment } from "@/server/storage/attachments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decision = await consumeRateLimit(
    db,
    rateRules.upload,
    session.user.id,
  );
  if (!decision.allowed) {
    return Response.json(
      { error: "Too many uploads. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
      },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Send one image as `file`." },
      { status: 400 },
    );
  }
  const problem = checkAttachment(file);
  if (problem || !isAttachmentType(file.type)) {
    return Response.json({ error: problem }, { status: 400 });
  }

  const id = nanoid();
  const key = attachmentKey(session.user.id, id, file.type);
  try {
    await storeAttachment(key, file, file.type);
  } catch (error) {
    console.error("[attachments] upload failed", error);
    return Response.json(
      { error: "Couldn't store the image. Try again." },
      { status: 502 },
    );
  }

  const attachment = await db.attachment.create({
    data: {
      id,
      key,
      userId: session.user.id,
      name: attachmentName(file.name),
      contentType: file.type,
      size: file.size,
    },
    select: { id: true, name: true, contentType: true, size: true },
  });
  return Response.json(attachment, { status: 201 });
}
