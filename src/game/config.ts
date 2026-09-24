import { Vector3 } from 'three';

/** Distance (m) at which each new horror joins the run; each one starts a level. */
const LEVEL_FROM = { hanged: 300, crucified: 700, brute: 1100, mutant: 1700, dogs: 2400 } as const;

/** Gameplay tunables. Distances in meters, times in seconds. Forward is -Z. */
export const CONFIG = {
  player: {
    startSpeed: 5,
    maxSpeed: 9,
    /** Extra forward speed gained per meter travelled. */
    speedPerMeter: 0.004,
    strafeSpeed: 7,
    eyeHeight: 1.7,
    /** A zombie closer than this grabs the player. */
    grabRadius: 0.9,
  },
  gun: {
    /** Body hits a zombie takes from a 1-damage bullet; headshots always kill. */
    bodyHealth: 2,
    range: 60,
  },
  /** How a zombie reacts to a bullet, alive or falling. Scaled by the weapon's recoil. */
  hitReaction: {
    /** Knockback speed (m/s) per point of recoil, bleeding off at `knockDamping` per second. */
    knockback: 5.5,
    knockbackMax: 9,
    knockDamping: 6,
    /** Stands still this long after a hit, then eases back to full speed over `recoverTime`. */
    staggerTime: 0.35,
    recoverTime: 0.45,
  },
  /** Course events, all in meters of distance run. */
  fences: {
    first: 180,
    gapMin: 230,
    gapMax: 400,
    /** How long the vault takes and how slow the runner is while climbing. */
    vaultTime: 0.95,
    vaultSpeedFactor: 0.3,
    vaultHeight: 0.75,
    /** Rows are this wide and follow the runner sideways, so there is no way round. */
    halfWidth: 39,
    height: 1.35,
  },
  corn: {
    first: 420,
    lengthMin: 90,
    lengthMax: 140,
    gapMin: 520,
    gapMax: 780,
    height: 2.7,
    tileLength: 20,
    tileCount: 5,
    /** Stalks wrap sideways around the runner within this half-width. */
    halfWidth: 30,
    /** Stalks per tile at density 1. */
    stalksPerTile: 2600,
    fogDensity: 0.085,
  },
  pickups: {
    first: 260,
    gapMin: 320,
    gapMax: 480,
    /** Pickups sit off the running line so the player has to steer to them. */
    offsetMin: 3,
    offsetMax: 7.5,
    radius: 1.4,
    /** Seconds (real time) to decide before the offer lapses; the game runs slowed meanwhile. */
    decisionTime: 6,
    decisionTimeScale: 0.15,
  },
  zombies: {
    spawnAheadMin: 45,
    spawnAheadMax: 75,
    /** Spawns are spread this far either side of the runner (not of a fixed lane). */
    spawnHalfWidth: 16,
    /** Zombies further than this sideways from the runner are dropped. */
    despawnSide: 60,
    baseInterval: 1.4,
    minInterval: 0.22,
    /** Meters over which the spawn interval halves its distance to the minimum (then keeps shrinking). */
    intervalHalfDistance: 500,
    walkSpeedMin: 0.8,
    walkSpeedMax: 1.8,
    lungeDistance: 3.2,
    lungeSpeed: 3.6,
    despawnBehind: 8,
    maxAliveStart: 40,
    maxAliveEnd: 75,
  },
  /** How the run escalates with distance. `ramp` is where it reaches full strength. */
  difficulty: {
    ramp: 3000,
    /** Walkers get up to this much faster at full difficulty. */
    walkSpeedBonus: 0.8,
    packChanceStart: 0.15,
    packChanceEnd: 0.5,
    packSizeStart: 2,
    packSizeEnd: 5,
    /** Runners: fast zombies that sprint at the player. */
    runnerFrom: 250,
    runnerChanceMax: 0.35,
    runnerSpeedMin: 3.6,
    runnerSpeedMax: 5,
  },
  /** Levels announced on the HUD as the run reaches them. */
  levels: [
    { from: 0, name: 'The field' },
    { from: LEVEL_FROM.hanged, name: 'Hanged men' },
    { from: LEVEL_FROM.crucified, name: 'The crucified' },
    { from: LEVEL_FROM.brute, name: 'The big one' },
    { from: LEVEL_FROM.mutant, name: 'Mutation' },
    { from: LEVEL_FROM.dogs, name: 'The pack' },
  ],
  /**
   * Set pieces and special zombies, scheduled along the run from their level onwards.
   * Gaps shrink by up to `gapShrink` at full difficulty.
   */
  horrors: {
    gapShrink: 0.4,
    /** How far ahead set pieces are put in place, and special zombies spawn. */
    showAhead: 95,
    spawnAhead: 65,
    /** Bodies hanging from dead trees, hooded, swinging. Pass underneath and they grab you. */
    hanged: { from: LEVEL_FROM.hanged, gapMin: 110, gapMax: 190, offsetMax: 3.5, grabRadius: 0.75, health: 2 },
    /** Zombies bound to crosses out in the field, writhing and screaming as you go by. */
    crucified: { from: LEVEL_FROM.crucified, gapMin: 170, gapMax: 300, offsetMin: 4, offsetMax: 9, screamDistance: 22, health: 3 },
    /** A huge slow zombie that soaks up bullets; headshots only do `headMultiplier` times damage. */
    brute: { from: LEVEL_FROM.brute, gapMin: 260, gapMax: 420, health: 12, headMultiplier: 4, speed: 1.3, grabRadius: 1.35 },
    /** A mutated four-legged thing with a split head, weaving as it gallops in. */
    mutant: { from: LEVEL_FROM.mutant, gapMin: 220, gapMax: 360, health: 5, headMultiplier: 3, speed: 6.5, weave: 3.5 },
    /** Fast zombie dogs in packs, the last and hardest stretch. */
    dogs: { from: LEVEL_FROM.dogs, gapMin: 120, gapMax: 220, packMin: 3, packMax: 5, health: 1, speed: 7.5 },
  },
  /** Night ambience: crickets hush when something gets close. */
  crickets: { hushNear: 5, fullAt: 25, hushedLevel: 0.2 },
  world: {
    tileLength: 40,
    tileCount: 4,
    treesPerTile: 3,
    scarecrowChance: 0.35,
    /** Props wrap sideways within this distance of the runner. */
    propHalfWidth: 55,
    /** Freshly placed props keep this far off the runner's current line. */
    propClearance: 4,
  },
  wheat: {
    height: 0.95,
    tileLength: 30,
    tileCount: 4,
    /** Tufts wrap sideways around the runner within this half-width. */
    halfWidth: 30,
    /** Tufts of 3 stalks per tile at density 1 (see ?quality=low|high). */
    tuftsPerTile: 5200,
  },
  atmosphere: {
    horizonColor: 0x3d4756,
    zenithColor: 0x05070b,
    silhouetteColor: 0x161a21,
    mistColor: 0x9aa6b8,
    fogDensity: 0.028,
    mistCount: 70,
    chaffCount: 500,
    moonDirection: new Vector3(-0.45, 0.42, -0.79).normalize(),
  },
} as const;
