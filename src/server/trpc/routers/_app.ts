import { createCallerFactory, createTRPCRouter } from "../init";
import { creditsRouter } from "./credits";
import { githubRouter } from "./github";
import { codeRouter } from "./code";
import { memoryRouter } from "./memory";
import { notificationsRouter } from "./notifications";
import { messageRouter } from "./message";
import { modelRouter } from "./model";
import { projectRouter } from "./project";
import { sandboxRouter } from "./sandbox";
import { versionRouter } from "./version";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  credits: creditsRouter,
  github: githubRouter,
  model: modelRouter,
  message: messageRouter,
  version: versionRouter,
  sandbox: sandboxRouter,
  code: codeRouter,
  memory: memoryRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
