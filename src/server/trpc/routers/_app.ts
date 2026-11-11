import { createCallerFactory, createTRPCRouter } from "../init";
import { creditsRouter } from "./credits";
import { modelRouter } from "./model";
import { projectRouter } from "./project";
import { statusRouter } from "./status";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  credits: creditsRouter,
  model: modelRouter,
  status: statusRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
