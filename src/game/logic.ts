import { CONFIG } from './config';

export type HitPart = 'head' | 'body' | 'legs';

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

/** Maps x into [center - half, center + half), wrapping around (period 2 * half). */
export function wrapAround(x: number, center: number, half: number): number {
  const period = 2 * half;
  const rel = x - center + half;
  return center - half + (((rel % period) + period) % period);
}

/** 0 at the start of a run, rising to 1 at `CONFIG.difficulty.ramp` meters. */
export function difficulty(distance: number): number {
  return clamp(distance / CONFIG.difficulty.ramp, 0, 1);
}

/** Seconds between zombie spawns; keeps shrinking the further the player gets, never below the minimum. */
export function spawnInterval(distance: number): number {
  const z = CONFIG.zombies;
  return z.minInterval + (z.baseInterval - z.minInterval) / (1 + Math.max(0, distance) / z.intervalHalfDistance);
}

/** How many zombies may be on their feet at once. */
export function maxAlive(distance: number): number {
  const z = CONFIG.zombies;
  return Math.round(lerp(z.maxAliveStart, z.maxAliveEnd, difficulty(distance)));
}

/** Chance that a spawn brings a pack, and how many extra zombies it holds. */
export function packFor(distance: number): { chance: number; size: number } {
  const d = CONFIG.difficulty;
  const t = difficulty(distance);
  return { chance: lerp(d.packChanceStart, d.packChanceEnd, t), size: Math.round(lerp(d.packSizeStart, d.packSizeEnd, t)) };
}

/** Share of new zombies that are runners: none early on, then rising to the cap. */
export function runnerChance(distance: number): number {
  const d = CONFIG.difficulty;
  if (distance <= d.runnerFrom) return 0;
  return d.runnerChanceMax * clamp((distance - d.runnerFrom) / (d.ramp - d.runnerFrom), 0, 1);
}

/** Speed for a new zombie given a uniform roll `u` (0..1) and whether it is a runner. */
export function zombieSpeed(distance: number, u: number, runner: boolean): number {
  const d = CONFIG.difficulty;
  if (runner) return lerp(d.runnerSpeedMin, d.runnerSpeedMax, u);
  const z = CONFIG.zombies;
  return lerp(z.walkSpeedMin, z.walkSpeedMax, u) + d.walkSpeedBonus * difficulty(distance);
}

export function playerSpeed(distance: number): number {
  const p = CONFIG.player;
  return Math.min(p.maxSpeed, p.startSpeed + distance * p.speedPerMeter);
}

export interface HitOutcome {
  health: number;
  killed: boolean;
  /** A leg came off: the zombie drops and crawls from now on. */
  crippled: boolean;
}

/**
 * Body shots chip away at health. Headshots always kill, unless `headMultiplier` is finite
 * (tough zombies), in which case they do that many times the damage.
 * Leg shots on a zombie that `canCripple` (on its feet, two legs) take a leg off: a share of
 * the damage (`CONFIG.crawl.legDamage`) that never kills. Otherwise legs count as the body.
 */
export function applyHit(
  health: number,
  part: HitPart,
  damage = 1,
  headMultiplier = Infinity,
  canCripple = false,
): HitOutcome {
  if (part === 'legs' && canCripple) {
    const next = Math.max(Math.min(health, 1), health - damage * CONFIG.crawl.legDamage);
    return { health: next, killed: false, crippled: true };
  }
  const next = part === 'head' ? (Number.isFinite(headMultiplier) ? health - damage * headMultiplier : 0) : health - damage;
  return { health: Math.max(0, next), killed: next <= 0, crippled: false };
}

/** How fast a legless zombie drags itself along, given how fast it walked. */
export function crawlSpeed(walkSpeed: number): number {
  const c = CONFIG.crawl;
  return Math.min(c.maxSpeed, walkSpeed * c.speedFactor);
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
  /** Weapon pickups: distance and sideways offset from the runner when the pickup comes into view. */
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

/** Index into `CONFIG.levels` of the level reached at `distance`. */
export function levelAt(distance: number): number {
  let level = 0;
  CONFIG.levels.forEach((l, i) => {
    if (distance >= l.from) level = i;
  });
  return level;
}

export interface HorrorPlan {
  /** Hanging bodies: distance and sideways offset from the runner when they come into view. */
  hanged: { at: number; x: number }[];
  crucified: { at: number; x: number }[];
  brutes: number[];
  mutants: number[];
  dogPacks: { at: number; size: number }[];
}

/**
 * Schedules the horrors from their level onwards, with gaps that shrink with difficulty.
 * Set pieces slide forward to keep clear of the `busy` distances (fences, pickups).
 */
export function planHorrors(rand: () => number, length: number, busy: readonly number[] = []): HorrorPlan {
  const h = CONFIG.horrors;
  const series = (from: number, gapMin: number, gapMax: number, clear = 0): number[] => {
    const out: number[] = [];
    for (let at = from + rand() * gapMin * 0.5; at < length; ) {
      while (clear > 0 && busy.some((b) => Math.abs(b - at) < clear)) at += 5;
      out.push(at);
      at += gap(rand, gapMin, gapMax) * (1 - h.gapShrink * difficulty(at));
    }
    return out;
  };
  const side = () => (rand() < 0.5 ? -1 : 1);
  return {
    hanged: series(h.hanged.from, h.hanged.gapMin, h.hanged.gapMax, 25).map((at) => ({ at, x: side() * rand() * h.hanged.offsetMax })),
    crucified: series(h.crucified.from, h.crucified.gapMin, h.crucified.gapMax, 15).map((at) => ({
      at,
      x: side() * gap(rand, h.crucified.offsetMin, h.crucified.offsetMax),
    })),
    brutes: series(h.brute.from, h.brute.gapMin, h.brute.gapMax),
    mutants: series(h.mutant.from, h.mutant.gapMin, h.mutant.gapMax),
    dogPacks: series(h.dogs.from, h.dogs.gapMin, h.dogs.gapMax).map((at) => ({
      at,
      size: h.dogs.packMin + Math.floor(rand() * (h.dogs.packMax - h.dogs.packMin + 1)),
    })),
  };
}

/** Cricket volume (0..1): they go quiet as the nearest zombie closes in. */
export function cricketLevel(nearest: number): number {
  const c = CONFIG.crickets;
  const t = clamp((nearest - c.hushNear) / (c.fullAt - c.hushNear), 0, 1);
  return lerp(c.hushedLevel, 1, t);
}
