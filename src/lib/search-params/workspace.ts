import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const workspaceViews = ["preview", "code"] as const;
export type WorkspaceViewParam = (typeof workspaceViews)[number];

export const previewDevices = ["desktop", "tablet", "mobile"] as const;
export type PreviewDevice = (typeof previewDevices)[number];

export const workspaceSearchParams = {
  view: parseAsStringLiteral(workspaceViews).withDefault("preview"),
  file: parseAsString,
  device: parseAsStringLiteral(previewDevices).withDefault("desktop"),
  version: parseAsInteger,
};
