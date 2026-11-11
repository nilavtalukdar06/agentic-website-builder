import "server-only";
import { env } from "@/config/env";
import type { CreditRate } from "./pricing";

export const creditRate: CreditRate = {
  creditsPerUsd: env.CREDITS_PER_USD,
  markup: env.CREDIT_MARKUP,
};
