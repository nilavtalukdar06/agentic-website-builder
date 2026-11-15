import { serve, type RequestHandler } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";
import { arcjetDenialResponse, ajPerIpRateLimit } from "@/server/arcjet";

export const maxDuration = 300;

const ajInngest = ajPerIpRateLimit(60, 60);

const served = serve({ client: inngest, functions });

function withArcjet(handler: RequestHandler): RequestHandler {
  return async (request, res) => {
    const arcjetDecision = await ajInngest.protect(request);
    const arcjetDenial = arcjetDenialResponse(arcjetDecision);
    if (arcjetDenial) return arcjetDenial;
    return handler(request, res);
  };
}

export const GET = withArcjet(served.GET);
export const POST = withArcjet(served.POST);
export const PUT = withArcjet(served.PUT);
