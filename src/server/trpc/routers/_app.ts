import { createCallerFactory, createTRPCRouter } from "../init";
import { creditsRouter } from "./credits";
import { messageRouter } from "./message";
import { modelRouter } from "./model";
import { projectRouter } from "./project";
import { sandboxRouter } from "./sandbox";
import { versionRouter } from "./version";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  credits: creditsRouter,
  model: modelRouter,
  message: messageRouter,
  version: versionRouter,
  sandbox: sandboxRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
