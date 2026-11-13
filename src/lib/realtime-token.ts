export async function fetchRealtimeToken(projectId: string) {
  const response = await fetch("/api/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!response.ok) {
    throw new Error(`Realtime token request failed (${response.status})`);
  }
  return response.json();
}
