import { parseAsStringLiteral } from "nuqs/server";
import { statusRanges } from "@/lib/status";

export const statusSearchParams = {
  range: parseAsStringLiteral(statusRanges).withDefault("24h"),
};
