import { createCallerFactory, createTRPCRouter } from "../init";
import { creditsRouter } from "./credits";
import { projectRouter } from "./project";
import { statusRouter } from "./status";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  credits: creditsRouter,
  status: statusRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
