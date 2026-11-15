import { toNextJsHandler } from "better-auth/next-js";
import {
  arcjetDenialResponse,
  ajBrowserBotWithRateLimit,
} from "@/server/arcjet";
import { auth } from "@/server/auth";

const ajAuth = ajBrowserBotWithRateLimit(30, 60);
const betterAuthHandler = toNextJsHandler(auth);

export async function GET(request: Request) {
  const arcjetDecision = await ajAuth.protect(request);
  const arcjetDenial = arcjetDenialResponse(arcjetDecision);
  if (arcjetDenial) return arcjetDenial;
  return betterAuthHandler.GET(request);
}

export async function POST(request: Request) {
  const arcjetDecision = await ajAuth.protect(request);
  const arcjetDenial = arcjetDenialResponse(arcjetDecision);
  if (arcjetDenial) return arcjetDenial;
  return betterAuthHandler.POST(request);
}
