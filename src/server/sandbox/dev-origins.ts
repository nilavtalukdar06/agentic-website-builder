export const ALLOWED_DEV_ORIGIN = "*.e2b.app";

const entry = `allowedDevOrigins: ["${ALLOWED_DEV_ORIGIN}"],`;
const emptyConfig = /(const nextConfig\b[^=]*=\s*)\{\s*\}/;
const openConfig = /(const nextConfig\b[^=]*=\s*\{)/;

export function withDevOrigins(source: string) {
  if (source.includes("allowedDevOrigins")) return null;
  if (emptyConfig.test(source)) {
    return source.replace(emptyConfig, `$1{\n  ${entry}\n}`);
  }
  if (openConfig.test(source)) {
    return source.replace(openConfig, `$1\n  ${entry}`);
  }
  return null;
}
