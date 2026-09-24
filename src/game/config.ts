import { Vector3 } from 'three';

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
