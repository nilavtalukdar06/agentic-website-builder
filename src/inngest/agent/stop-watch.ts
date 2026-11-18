export class StopRequested extends Error {
  constructor() {
    super("The user stopped the run.");
    this.name = "StopRequested";
  }
}

export const STOP_POLL_MS = 1500;

export async function withStopWatch<T>(
  shouldStop: (() => Promise<boolean>) | undefined,
  run: (signal: AbortSignal | undefined) => Promise<T>,
  intervalMs = STOP_POLL_MS,
): Promise<T> {
  if (!shouldStop) return run(undefined);
  const controller = new AbortController();
  let stopped = false;
  let checking = false;
  const timer = setInterval(async () => {
    if (checking || stopped) return;
    checking = true;
    try {
      if (await shouldStop()) {
        stopped = true;
        controller.abort();
      }
    } catch {
      return;
    } finally {
      checking = false;
    }
  }, intervalMs);
  try {
    const result = await run(controller.signal);
    if (stopped) throw new StopRequested();
    return result;
  } catch (error) {
    if (stopped) throw new StopRequested();
    throw error;
  } finally {
    clearInterval(timer);
  }
}
