// Global registry of active CLI runs by OpenClaw sessionId.
// Fixes critical bug: abortEmbeddedPiRun has no effect for CLI sessions
// since CLI runs are NOT registered in ACTIVE_EMBEDDED_RUNS.
// This registry allows /stop and /kill to actually terminate subprocess.

export type CliRunHandle = {
  cancel: () => void;
  pid?: number;
  startedAtMs: number;
};

const ACTIVE_CLI_RUNS = new Map<string, CliRunHandle>();

export function registerActiveCliRun(
  sessionId: string,
  cancel: () => void,
  pid?: number,
): void {
  ACTIVE_CLI_RUNS.set(sessionId, { cancel, pid, startedAtMs: Date.now() });
}

export function unregisterActiveCliRun(sessionId: string): void {
  ACTIVE_CLI_RUNS.delete(sessionId);
}

export function cancelActiveCliRun(sessionId: string): boolean {
  const handle = ACTIVE_CLI_RUNS.get(sessionId);
  if (!handle) {
    return false;
  }
  handle.cancel();
  return true;
}

export function getActiveCliRunInfo(sessionId: string): CliRunHandle | undefined {
  return ACTIVE_CLI_RUNS.get(sessionId);
}

export function hasActiveCliRun(sessionId: string): boolean {
  return ACTIVE_CLI_RUNS.has(sessionId);
}
