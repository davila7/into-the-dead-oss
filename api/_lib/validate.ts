/** Server-side sanity checks for a finished run. The client reports the stats; the server owns the clock. */

/** Fastest the runner can go (CONFIG.player.maxSpeed, m/s) plus headroom for frame timing. */
export const MAX_SPEED = 9 * 1.1;
/** Runs left open longer than this can no longer be submitted. */
export const MAX_RUN_SECONDS = 3 * 60 * 60;
/** Generous ceiling on kills per second (pierce and shotgun packs can drop several at once). */
export const MAX_KILLS_PER_SECOND = 8;

export interface RunStats {
  distance: number;
  kills: number;
  headshots: number;
}

export type Validation = { ok: true; stats: RunStats } | { ok: false; error: string };

const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * Checks the reported stats against the time the server says the run lasted.
 * Pausing only adds wall-clock time, so these bounds never reject an honest run.
 */
export function validateRun(body: unknown, elapsedSeconds: number): Validation {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const { distance, kills, headshots } = body as Record<string, unknown>;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) return { ok: false, error: 'Invalid distance' };
  if (!count(kills) || !count(headshots)) return { ok: false, error: 'Invalid kills' };
  if (headshots > kills) return { ok: false, error: 'More headshots than kills' };
  if (elapsedSeconds > MAX_RUN_SECONDS) return { ok: false, error: 'Run expired' };
  if (distance > elapsedSeconds * MAX_SPEED + 5) return { ok: false, error: 'Distance not possible in that time' };
  if (kills > elapsedSeconds * MAX_KILLS_PER_SECOND + 20) return { ok: false, error: 'Kills not possible in that time' };
  return { ok: true, stats: { distance: Math.round(distance * 10) / 10, kills, headshots } };
}

/** Name shown on the leaderboard: username, else first name + last initial, else a default. */
export function displayName(user: { username?: string | null; firstName?: string | null; lastName?: string | null }): string {
  const name = user.username || [user.firstName, user.lastName ? `${user.lastName[0]}.` : ''].filter(Boolean).join(' ');
  return (name.trim() || 'Survivor').slice(0, 32);
}
