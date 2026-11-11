import { createCallerFactory, createTRPCRouter } from "../init";
import { creditsRouter } from "./credits";
import { projectRouter } from "./project";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  credits: creditsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
