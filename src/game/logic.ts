import { CONFIG } from './config';

export type HitPart = 'head' | 'body';

/** Deterministic PRNG so scenery and tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Seconds between zombie spawns; shrinks the further the player gets. */
export function spawnInterval(distance: number): number {
  const z = CONFIG.zombies;
  return Math.max(z.minInterval, z.baseInterval - distance * z.intervalDecayPerMeter);
}

export function playerSpeed(distance: number): number {
  const p = CONFIG.player;
  return Math.min(p.maxSpeed, p.startSpeed + distance * p.speedPerMeter);
}

/** Headshots always kill; body shots chip away at health. */
export function applyHit(health: number, part: HitPart): { health: number; killed: boolean } {
  const next = part === 'head' ? 0 : health - 1;
  return { health: Math.max(0, next), killed: next <= 0 };
}

/**
 * Moves (x, z) towards (tx, tz) by at most speed * dt and returns the new position.
 * Never overshoots the target.
 */
export function stepTowards(
  x: number,
  z: number,
  tx: number,
  tz: number,
  speed: number,
  dt: number,
): { x: number; z: number; distance: number } {
  const dx = tx - x;
  const dz = tz - z;
  const distance = Math.hypot(dx, dz);
  const step = speed * dt;
  if (distance <= step || distance === 0) return { x: tx, z: tz, distance: 0 };
  const k = step / distance;
  return { x: x + dx * k, z: z + dz * k, distance: distance - step };
}
