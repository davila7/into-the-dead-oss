import { Vector3 } from 'three';

/** Gameplay tunables. Distances in meters, times in seconds. Forward is -Z. */
export const CONFIG = {
  player: {
    startSpeed: 5,
    maxSpeed: 9,
    /** Extra forward speed gained per meter travelled. */
    speedPerMeter: 0.004,
    strafeSpeed: 7,
    laneHalfWidth: 9,
    eyeHeight: 1.7,
    /** A zombie closer than this grabs the player. */
    grabRadius: 0.9,
  },
  gun: {
    /** Body hits a zombie takes from a 1-damage bullet; headshots always kill. */
    bodyHealth: 2,
    range: 60,
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
    halfWidth: 13,
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
    spawnHalfWidth: 14,
    baseInterval: 1.4,
    minInterval: 0.45,
    intervalDecayPerMeter: 0.0012,
    walkSpeedMin: 0.8,
    walkSpeedMax: 1.8,
    lungeDistance: 3.2,
    lungeSpeed: 3.6,
    despawnBehind: 8,
    maxAlive: 40,
  },
  world: {
    tileLength: 40,
    tileCount: 4,
    treesPerTile: 3,
    scarecrowChance: 0.35,
  },
  wheat: {
    height: 0.95,
    tileLength: 30,
    tileCount: 4,
    halfWidth: 34,
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
