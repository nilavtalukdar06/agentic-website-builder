export function isSandboxGone(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "SandboxNotFoundError" ||
    error.name === "SandboxNotRunningError" ||
    error.name === "GuestUnresponsiveError" ||
    error.message.includes("sandbox_snapshot_guest_agent_unresponsive") ||
    /sandbox\b.*\b(not found|was not found|is not running|has been killed)/i.test(
      error.message,
    )
  );
}
