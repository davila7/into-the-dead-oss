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
export function applyHit(health: number, part: HitPart, damage = 1): { health: number; killed: boolean } {
  const next = part === 'head' ? 0 : health - damage;
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

export interface CornStretch {
  /** Distance (m) where the corn starts and ends. */
  start: number;
  end: number;
}

export interface CoursePlan {
  /** Distances of fences across the lane, ascending. */
  fences: number[];
  corn: CornStretch[];
  /** Weapon pickups: distance and sideways offset from the lane centre. */
  pickups: { at: number; x: number }[];
}

function gap(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

/**
 * Lays out the course up to `length` meters: corn stretches, fences and weapon pickups.
 * Fences and pickups keep clear of the corn (and of each other) so each event reads on its own.
 */
export function planCourse(rand: () => number, length: number): CoursePlan {
  const { fences: f, corn: c, pickups: p } = CONFIG;
  const corn: CornStretch[] = [];
  for (let at = c.first; at < length; ) {
    const end = at + gap(rand, c.lengthMin, c.lengthMax);
    corn.push({ start: at, end });
    at = end + gap(rand, c.gapMin, c.gapMax);
  }
  const clearOfCorn = (d: number, margin: number) => !corn.some((s) => d > s.start - margin && d < s.end + margin);

  const pickups: CoursePlan['pickups'] = [];
  for (let at = p.first; at < length; at += gap(rand, p.gapMin, p.gapMax)) {
    // Push the pickup past a corn stretch instead of hiding it inside.
    const inside = corn.find((s) => at > s.start - 20 && at < s.end + 20);
    if (inside) at = inside.end + 30;
    const side = rand() < 0.5 ? -1 : 1;
    pickups.push({ at, x: side * gap(rand, p.offsetMin, p.offsetMax) });
  }

  const fences: number[] = [];
  for (let at = f.first; at < length; at += gap(rand, f.gapMin, f.gapMax)) {
    // Slide forward past corn and pickups rather than dropping the fence.
    while (!clearOfCorn(at, 25) || pickups.some((k) => Math.abs(k.at - at) < 30)) at += 10;
    fences.push(at);
  }
  return { fences, corn, pickups };
}

/** 0 outside the corn, rising to 1 over the first/last few meters of a stretch. */
export function cornCover(corn: readonly CornStretch[], distance: number, fade = 6): number {
  for (const s of corn) {
    if (distance > s.start && distance < s.end) {
      return clamp(Math.min(distance - s.start, s.end - distance) / fade, 0, 1);
    }
  }
  return 0;
}

/** Height of the vault arc and the speed factor at progress t (0..1) through a fence vault. */
export function vaultProfile(t: number): { lift: number; speed: number } {
  const k = clamp(t, 0, 1);
  const lift = Math.sin(k * Math.PI);
  // Slowest while scrambling over the top.
  const speed = lerp(1, CONFIG.fences.vaultSpeedFactor, Math.sin(Math.min(1, k * 1.2) * Math.PI) ** 0.5);
  return { lift, speed };
}
