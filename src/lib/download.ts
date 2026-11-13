const DATA_URL = /^data:([\w.+/-]+);base64,/;

export function snapshotBytes(value: string): string | Uint8Array {
  const match = DATA_URL.exec(value);
  if (!match) return value;
  const binary = atob(value.slice(match[0].length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function isBinarySnapshotValue(value: string) {
  return DATA_URL.test(value);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadFile(path: string, value: string) {
  const content = snapshotBytes(value);
  const name = path.split("/").pop() || "file";
  saveBlob(
    new Blob([content as BlobPart], {
      type:
        typeof content === "string"
          ? "text/plain;charset=utf-8"
          : (DATA_URL.exec(value)?.[1] ?? "application/octet-stream"),
    }),
    name,
  );
}

export async function downloadZip(name: string, files: Record<string, string>) {
  const { downloadZip: zip } = await import("client-zip");
  const blob = await zip(
    Object.entries(files).map(([path, value]) => ({
      name: `${name}/${path}`,
      input: snapshotBytes(value),
      lastModified: new Date(),
    })),
  ).blob();
  saveBlob(blob, `${name}.zip`);
}
