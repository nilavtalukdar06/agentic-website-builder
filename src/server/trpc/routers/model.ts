import { TRPCError } from "@trpc/server";
import { getAgentModels, pickDefaultModel } from "@/server/ai/gateway";
import { createTRPCRouter, protectedProcedure } from "../init";

export const modelRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    const models = await getAgentModels().catch((error: unknown) => {
      console.error("[model.list] gateway catalogue failed", error);
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Couldn't load the model list.",
      });
    });
    return { models, defaultModelId: pickDefaultModel(models)?.id ?? null };
  }),
});
