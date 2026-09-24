import { Vector3 } from 'three';

/** Distance (m) at which each new horror joins the run; each one starts a level. */
const LEVEL_FROM = { hanged: 110, crucified: 260, brute: 420, mutant: 600, dogs: 800 } as const;

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
    /** Body hits a zombie takes from a 1-damage bullet; headshots always kill, leg shots cripple (see `crawl`). */
    bodyHealth: 2,
    range: 60,
  },
  /**
   * Kill cam: a short slow-motion beat with a slight zoom on a headshot kill or a chain of kills.
   * Times are real seconds; the weapon offer's own slow motion wins while it is open.
   */
  killCam: {
    duration: 0.3,
    timeScale: 0.25,
    /** The field of view narrows by this fraction at the peak. */
    zoom: 0.08,
    /** Kills each within `chainWindow` of the last one count as a chain once there are `chainKills`. */
    chainKills: 3,
    chainWindow: 0.9,
    /** Real seconds after a kill cam starts before another can, so automatic fire doesn't crawl. */
    cooldown: 1.2,
  },
  /**
   * Bullet cam: now and then a headshot kill is replayed in ultra slow motion, the camera riding
   * alongside the bullet, spinning round it and closing in until it strikes the head.
   * Times are real seconds. `?bulletcam=always` plays it on every headshot (for tuning).
   */
  bulletCam: {
    /** Earliest into a run, and the gap after one, before another can play. */
    firstAfter: 12,
    cooldown: 25,
    /** Chance an eligible headshot kill gets the bullet cam. */
    chance: 0.5,
    /** Headshots closer than this are too short a flight to follow. */
    minDistance: 7,
    /** Chase time grows with distance, within these bounds. */
    flightPerMeter: 0.12,
    flightMin: 2.2,
    flightMax: 3.6,
    /**
     * The last `entryLead` meters are shown side-on over `entryTime`: the bullet creeps in and
     * reaches the head at `entryHit` of that time, then sinks `entryDepth` into it.
     */
    entryLead: 0.8,
    entryTime: 2.2,
    entryHit: 0.65,
    entryDepth: 0.12,
    /** World time scale in flight, while the bullet goes in, and as the zombie goes down. */
    flightTimeScale: 0.005,
    entryTimeScale: 0.03,
    impactTime: 1.6,
    impactTimeScale: 0.12,
    /** Rings of disturbed air shed behind the bullet: one every `ringInterval` real seconds. */
    ringInterval: 0.045,
    ringLife: 0.8,
    ringSize: 0.11,
    /** Turns the camera makes round the bullet on its way in. */
    spins: 1.25,
    /** Field of view (deg) at the muzzle, at the head, and when the replay ends. */
    fovStart: 55,
    fovImpact: 30,
    fovEnd: 42,
  },
  /** Leg shots blow a leg off: the zombie drops and drags itself on, slow and low. */
  crawl: {
    /** Share of the weapon's body damage a leg hit does; it never kills. */
    legDamage: 0.5,
    /** Crawl speed is the walking speed times this, capped at `maxSpeed` (runners too). */
    speedFactor: 0.35,
    maxSpeed: 1.1,
    /** Seconds to go from standing to prone. */
    dropTime: 0.4,
    /** Forward pitch (rad) of the prone body; `hipShift` (m) pulls it back so it lies over its spot. */
    pitch: 1.35,
    hipShift: 1.1,
    lift: 0.18,
    /** Crawlers can't lunge; they only grab ankles this close. */
    grabRadius: 0.75,
    /** Share of a severed leg that stays on as a stump. */
    stump: 0.3,
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
    first: 130,
    gapMin: 170,
    gapMax: 280,
    /** How long the vault takes and how slow the runner is while climbing. */
    vaultTime: 0.95,
    vaultSpeedFactor: 0.3,
    vaultHeight: 0.75,
    /** Rows are this wide and follow the runner sideways, so there is no way round. */
    halfWidth: 39,
    height: 1.35,
  },
  corn: {
    first: 300,
    lengthMin: 70,
    lengthMax: 110,
    gapMin: 380,
    gapMax: 560,
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
    first: 60,
    gapMin: 170,
    gapMax: 260,
    /** Pickups sit off the running line so the player has to steer to them. */
    offsetMin: 3,
    offsetMax: 7.5,
    radius: 1.4,
    /** Seconds (real time) to decide before the offer lapses; the game runs slowed meanwhile. */
    decisionTime: 6,
    decisionTimeScale: 0.15,
  },
  /** Roguelite perks: every `every` meters (from `first`) the run pauses in slow motion to pick 1 of `choices`. */
  perks: {
    first: 200,
    every: 250,
    choices: 3,
    /** Real seconds to pick before the choice lapses; the game runs slowed meanwhile. */
    decisionTime: 8,
    decisionTimeScale: 0.15,
    /** Per stack. Factors multiply, so two Quick Hands reload in 0.75² of the time. */
    reloadFactor: 0.75,
    pierceBonus: 1,
    magazineFactor: 1.5,
    fireCooldownFactor: 0.8,
    strafeFactor: 1.25,
    /** Second Wind: everything this close drops when a grab is shoved off, then a moment of grace. */
    shoveRadius: 4.5,
    graceTime: 1.2,
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
    intervalHalfDistance: 350,
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
    ramp: 1600,
    /** Walkers get up to this much faster at full difficulty. */
    walkSpeedBonus: 0.8,
    packChanceStart: 0.15,
    packChanceEnd: 0.5,
    packSizeStart: 2,
    packSizeEnd: 5,
    /** Runners: fast zombies that sprint at the player. */
    runnerFrom: 150,
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
    hanged: { from: LEVEL_FROM.hanged, gapMin: 70, gapMax: 120, offsetMax: 3.5, grabRadius: 0.75, health: 2 },
    /** Zombies bound to crosses out in the field, writhing and screaming as you go by. */
    crucified: { from: LEVEL_FROM.crucified, gapMin: 110, gapMax: 190, offsetMin: 4, offsetMax: 9, screamDistance: 22, health: 3 },
    /** A huge slow zombie that soaks up bullets; headshots only do `headMultiplier` times damage. */
    brute: { from: LEVEL_FROM.brute, gapMin: 170, gapMax: 280, health: 12, headMultiplier: 4, speed: 1.3, grabRadius: 1.35 },
    /** A mutated four-legged thing with a split head, weaving as it gallops in. */
    mutant: { from: LEVEL_FROM.mutant, gapMin: 150, gapMax: 240, health: 5, headMultiplier: 3, speed: 6.5, weave: 3.5 },
    /** Fast zombie dogs in packs, the last and hardest stretch. */
    dogs: { from: LEVEL_FROM.dogs, gapMin: 90, gapMax: 160, packMin: 3, packMax: 5, health: 1, speed: 7.5 },
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
