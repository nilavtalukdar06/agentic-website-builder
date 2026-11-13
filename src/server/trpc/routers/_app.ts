import { createCallerFactory, createTRPCRouter } from "../init";
import { creditsRouter } from "./credits";
import { modelRouter } from "./model";
import { projectRouter } from "./project";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  credits: creditsRouter,
  model: modelRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
