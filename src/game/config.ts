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
    magazine: 6,
    reloadTime: 1.6,
    fireCooldown: 0.28,
    bodyHealth: 2,
    range: 60,
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
