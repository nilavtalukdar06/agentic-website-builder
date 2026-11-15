import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/config/env";
import { grantWelcomeCredits } from "@/server/billing/welcome-credits";
import { db } from "@/server/db";

export const auth = betterAuth({
  appName: "Vibe",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  disabledPaths: ["/get-access-token", "/refresh-token"],
  database: prismaAdapter(db, { provider: "postgresql" }),
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      scope: ["read:user", "user:email"],
      disableDefaultScope: true,
    },
  },
  rateLimit: { storage: "database" },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: {
    encryptOAuthTokens: true,
    updateAccountOnSignIn: false,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await grantWelcomeCredits(db, user.id, env.WELCOME_CREDITS);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
