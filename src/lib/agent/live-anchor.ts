export function liveReplyAnchor(
  messages: readonly { id: string; pending: boolean }[],
  building: boolean,
) {
  if (!building) return null;
  return (
    messages.find((message) => message.pending)?.id ??
    messages.at(-1)?.id ??
    null
  );
}
