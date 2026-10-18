/**
 * Process-local registry of PRs whose brief is being generated. The app runs
 * as a single process (spec non-goal), so a module-level Set is sufficient.
 */
const inFlight = new Set<string>();

/** True when the lock was taken; false when a generation is already running. */
export function tryAcquireGeneration(prId: string): boolean {
  if (inFlight.has(prId)) return false;
  inFlight.add(prId);
  return true;
}

export function releaseGeneration(prId: string): void {
  inFlight.delete(prId);
}

export function isGenerating(prId: string): boolean {
  return inFlight.has(prId);
}
