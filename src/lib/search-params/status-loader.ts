import { createLoader } from "nuqs/server";
import { statusSearchParams } from "./status";

export const loadStatusSearchParams = createLoader(statusSearchParams);
