import "server-only";
import { cache } from "react";
import { db } from "@/server/db";
import { getSession } from "@/server/session";
import type { TRPCContext } from "./init";

export const createTRPCContext = cache(async (): Promise<TRPCContext> => ({
  db,
  session: await getSession(),
}));
