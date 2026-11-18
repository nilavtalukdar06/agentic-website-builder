export function isProjectScreenshotKey(key: string, projectId: string) {
  const prefix = `qa/${projectId}/`;
  return (
    key.startsWith(prefix) &&
    /^[A-Za-z0-9_-]+\/\d+-(desktop|phone)\.png$/.test(key.slice(prefix.length))
  );
}
