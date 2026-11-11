import { createCallerFactory, createTRPCRouter } from "../init";
import { devRouter } from "./dev";
import { projectRouter } from "./project";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
