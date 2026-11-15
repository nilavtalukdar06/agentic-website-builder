import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import {
  arcjetDenialResponse,
  ajBrowserBotWithRateLimit,
} from "@/server/arcjet";
import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/routers/_app";

const ajTrpc = ajBrowserBotWithRateLimit(120, 60);

const handler = async (req: Request) => {
  const arcjetDecision = await ajTrpc.protect(req);
  const arcjetDenial = arcjetDenialResponse(arcjetDecision);
  if (arcjetDenial) return arcjetDenial;

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext(),
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[trpc] ${path ?? "unknown"} failed`, error);
      }
    },
  });
};

export const maxDuration = 300;

export { handler as GET, handler as POST };
