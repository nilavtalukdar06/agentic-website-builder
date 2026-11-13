import { parseAsInteger, parseAsStringLiteral } from "nuqs/server";
export const usageSearchParams = {
  range: parseAsStringLiteral(["14d", "30d"] as const).withDefault("14d"),
  page: parseAsInteger.withDefault(1),
};
