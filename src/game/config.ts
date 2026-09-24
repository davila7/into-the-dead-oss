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
    treesPerTile: 18,
    fogColor: 0x252b33,
    fogNear: 10,
    fogFar: 68,
  },
} as const;
