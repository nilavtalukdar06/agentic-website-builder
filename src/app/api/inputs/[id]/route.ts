import { db } from "@/server/db";
import { answerInputRequest } from "@/server/inputs/answer";
import { sendAnswerEvent } from "@/server/inputs/send";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore },
    );
  }
  const { id } = await params;
  if (!id || id.length > 200) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: noStore },
    );
  }
  const body = await request.json().catch(() => null);
  const result = await answerInputRequest(
    { db, send: sendAnswerEvent },
    { userId: session.user.id, requestId: id, body },
  );
  return Response.json(result.body, {
    status: result.status,
    headers: noStore,
  });
}
