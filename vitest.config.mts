import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
      DIRECT_URL: "postgresql://user:pass@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      BETTER_AUTH_URL: "http://localhost:3000",
      GITHUB_CLIENT_ID: "test-client-id",
      GITHUB_CLIENT_SECRET: "test-client-secret",
      AI_GATEWAY_API_KEY: "test-gateway-key",
      E2B_API_KEY: "test-e2b-key",
      E2B_TEMPLATE_ID: "test-template",
      AWS_ACCESS_KEY_ID: "test-access-key",
      AWS_SECRET_ACCESS_KEY: "test-secret-key",
      AWS_ENDPOINT_URL_S3: "https://storage.test.neon.tech",
    },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
