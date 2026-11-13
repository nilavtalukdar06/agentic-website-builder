export const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp[34]|webm|mov|wav|ogg|pdf|zip|gz|tar|wasm)$/i;

const mimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  wasm: "application/wasm",
};

const DATA_URL = /^data:([\w.+/-]+);base64,/;

export function isBinaryPath(path: string) {
  return BINARY_EXTENSIONS.test(path);
}

export function mimeTypeFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return mimeTypes[extension] ?? "application/octet-stream";
}

export function encodeBinaryFile(path: string, bytes: Uint8Array) {
  return `data:${mimeTypeFor(path)};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function isBinarySnapshot(value: string) {
  return DATA_URL.test(value);
}

export function decodeSnapshotFile(value: string): string | Uint8Array {
  const match = DATA_URL.exec(value);
  if (!match) return value;
  return new Uint8Array(Buffer.from(value.slice(match[0].length), "base64"));
}
