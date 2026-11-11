import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "Must be a postgres:// or postgresql:// URL");

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: postgresUrl,
    DIRECT_URL: postgresUrl,
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    WELCOME_CREDITS: z.coerce.number().int().min(0).default(0),
    CRON_SECRET: z.string().min(16).optional(),
    AI_GATEWAY_API_KEY: z.string().min(1),
    AI_DEFAULT_MODEL: z.string().min(1).default("anthropic/claude-sonnet-5.5"),
    CREDITS_PER_USD: z.coerce.number().int().positive().default(100),
    CREDIT_MARKUP: z.coerce.number().min(1).default(1),
    E2B_API_KEY: z.string().min(1),
    E2B_TEMPLATE_ID: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_ENDPOINT_URL_S3: z.url(),
    AWS_REGION: z.string().min(1).default("us-east-1"),
    INNGEST_DEV: z.string().min(1).optional(),
    INNGEST_EVENT_KEY: z.string().min(1).optional(),
    INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    WELCOME_CREDITS: process.env.WELCOME_CREDITS,
    CRON_SECRET: process.env.CRON_SECRET,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL,
    CREDITS_PER_USD: process.env.CREDITS_PER_USD,
    CREDIT_MARKUP: process.env.CREDIT_MARKUP,
    E2B_API_KEY: process.env.E2B_API_KEY,
    E2B_TEMPLATE_ID: process.env.E2B_TEMPLATE_ID,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_ENDPOINT_URL_S3: process.env.AWS_ENDPOINT_URL_S3,
    AWS_REGION: process.env.AWS_REGION,
    INNGEST_DEV: process.env.INNGEST_DEV,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
