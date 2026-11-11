import { env } from "@/config/env";

export function areDevRoutesEnabled() {
  return env.NODE_ENV !== "production" || env.DEV_ROUTES_ENABLED;
}
