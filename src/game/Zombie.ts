import * as THREE from 'three';
import { CONFIG } from './config';
import { applyHit, clamp, crawlSpeed, type HitPart, stepTowards } from './logic';
import type { ZombieBody } from './ZombieBody';

type ZombieState = 'walking' | 'lunging' | 'dying' | 'dead';

export interface HitResult {
  killed: boolean;
  /** A leg came off with this hit. */
  crippled: boolean;
  point: THREE.Vector3;
  part: HitPart;
}

/** Anything the gun can hit: zombies and the set pieces (hanged, crucified). */
export interface Shootable {
  readonly alive: boolean;
  readonly position: THREE.Vector3;
  readonly hitMeshes: THREE.Mesh[];
  hit(part: HitPart, point: THREE.Vector3, damage?: number): HitResult;
}

export type EnemyKind = 'walker' | 'brute' | 'mutant' | 'dog';

interface KindStats {
  health: number;
  /** Headshot damage multiplier; Infinity means headshots always kill. */
  headMultiplier: number;
  grabRadius: number;
  /** Four-legged: falls over sideways instead of backwards. */
  quad: boolean;
  /** Sideways weave (m) while closing in. */
  weave: number;
  /** Two-legged: a leg shot takes a leg off and it crawls on. */
  crawls: boolean;
}

function statsFor(kind: EnemyKind): KindStats {
  const h = CONFIG.horrors;
  switch (kind) {
    case 'brute':
      return { health: h.brute.health, headMultiplier: h.brute.headMultiplier, grabRadius: h.brute.grabRadius, quad: false, weave: 0, crawls: true };
    case 'mutant':
      return { health: h.mutant.health, headMultiplier: h.mutant.headMultiplier, grabRadius: 1.1, quad: true, weave: h.mutant.weave, crawls: false };
    case 'dog':
      return { health: h.dogs.health, headMultiplier: Infinity, grabRadius: CONFIG.player.grabRadius, quad: true, weave: 0.6, crawls: false };
    default:
      return { health: CONFIG.gun.bodyHealth, headMultiplier: Infinity, grabRadius: CONFIG.player.grabRadius, quad: false, weave: 0, crawls: true };
  }
}

export class Zombie implements Shootable {
  readonly root = new THREE.Group();
  readonly body: ZombieBody;

  state: ZombieState = 'walking';
  readonly kind: EnemyKind;
  private readonly stats: KindStats;
  private health: number;
  private readonly speed: number;
  private age = Math.random() * 10;
  private flinch = 0;
  private deathTime = 0;
  private readonly knock = new THREE.Vector3();
  private stagger = 0;
  private recover = 0;
  /** Lost a leg: crawls from now on. `drop` eases 0..1 from standing to prone. */
  crippled = false;
  private drop = 0;
  /** Seconds until this zombie groans again (driven by the game's audio). */
  groanIn = 1 + Math.random() * 6;
  /** Set for the frame in which the zombie starts its lunge. */
  startedLunge = false;

  /**
   * `speed` in m/s; runners come in well above walking pace (see `zombieSpeed`).
   * `makeBody` builds the look; it gets this zombie to tag hit meshes with.
   */
  constructor(x: number, z: number, speed: number, makeBody: (owner: Zombie) => ZombieBody, kind: EnemyKind = 'walker') {
    this.speed = speed;
    this.kind = kind;
    this.stats = statsFor(kind);
    this.health = this.stats.health;
    this.body = makeBody(this);
    this.root.add(this.body.object);
    this.root.rotation.order = 'YXZ';
    this.root.position.set(x, 0, z);
  }

  get hitMeshes(): THREE.Mesh[] {
    return this.body.hitMeshes;
  }

  get alive(): boolean {
    return this.state === 'walking' || this.state === 'lunging';
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Returns true when this zombie reaches the player. */
  /** `slow` scales walking speed, e.g. while clambering over a fence. */
  update(dt: number, player: THREE.Vector3, slow = 1): boolean {
    this.startedLunge = false;
    this.slide(dt);
    slow *= this.staggerFactor(dt);
    if (!this.alive) {
      this.updateDeath(dt);
      return false;
    }

    this.age += dt;
    if (this.crippled) this.pose(dt);
    const p = this.root.position;
    const dist = Math.hypot(player.x - p.x, player.z - p.z);
    const cfg = CONFIG.zombies;
    const lungeDistance = cfg.lungeDistance + (this.stats.grabRadius - CONFIG.player.grabRadius);
    // Only lunge at a player that is still in front (the player moves towards -Z). Crawlers can't.
    if (this.state === 'walking' && !this.crippled && dist < lungeDistance && p.z < player.z) {
      this.state = 'lunging';
      this.startedLunge = true;
    }

    const lunging = this.state === 'lunging';
    const pace = this.crippled ? crawlSpeed(this.speed) : lunging ? Math.max(cfg.lungeSpeed, this.speed * 1.15) : this.speed;
    const speed = pace * (this.flinch > 0 ? 0.2 : 1) * slow;
    // Weavers swing side to side on the way in and straighten up close.
    const weave = this.stats.weave * Math.sin(this.age * 1.4) * clamp((dist - 6) / 20, 0, 1);
    const next = stepTowards(p.x, p.z, player.x + weave, player.z, speed, dt);
    p.x = next.x;
    p.z = next.z;
    this.root.rotation.y = Math.atan2(player.x + weave - p.x, player.z - p.z);

    this.flinch = Math.max(0, this.flinch - dt);
    this.body.animate(dt, speed, lunging, this.flinch, this.crippled);
    const grab = this.crippled ? Math.min(this.stats.grabRadius, CONFIG.crawl.grabRadius) : this.stats.grabRadius;
    return Math.hypot(player.x - p.x, player.z - p.z) < grab;
  }

  /** Drops the body forward onto the ground, hips pulled back so it lies over its spot. */
  private pose(dt: number): void {
    const c = CONFIG.crawl;
    this.drop = Math.min(1, this.drop + dt / c.dropTime);
    const k = this.drop * this.drop;
    this.root.rotation.x = c.pitch * k;
    this.root.position.y = c.lift * k;
    this.body.object.position.y = -c.hipShift * k;
  }

  private updateDeath(dt: number): void {
    this.deathTime += dt;
    const fall = clamp(this.deathTime / 0.45, 0, 1);
    if (this.crippled) {
      // Already down: slump flat where it lies.
      this.pose(dt);
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, Math.PI / 2, fall);
      this.root.position.y = CONFIG.crawl.lift * this.drop * (1 - fall * 0.6);
    } else if (this.stats.quad) {
      // Four-legged things roll onto their side.
      this.root.rotation.z = fall * fall * (Math.PI / 2) * 0.9;
    } else {
      // Ease-in fall backwards (away from the player).
      this.root.rotation.x = -(fall * fall) * (Math.PI / 2);
      this.root.position.y = 0.15 * fall;
    }
    if (this.deathTime > 4) this.root.position.y -= (this.deathTime - 4) * 0.5;
    if (this.deathTime > 6) this.state = 'dead';
    this.body.animateDeath(dt);
  }

  hit(part: HitPart, point: THREE.Vector3, damage = 1): HitResult {
    const r = applyHit(this.health, part, damage, this.stats.headMultiplier, this.stats.crawls && !this.crippled);
    this.health = r.health;
    if (r.killed) this.state = 'dying';
    // Big ones barely flinch.
    else this.flinch = this.kind === 'brute' ? 0.08 : 0.25;
    if (r.crippled) {
      this.crippled = true;
      if (this.state === 'lunging') this.state = 'walking';
      // Which leg: the side of the body the bullet struck.
      this.body.dismember?.(this.body.object.worldToLocal(point.clone()).x);
    }
    return { killed: r.killed, crippled: r.crippled, point, part };
  }

  /** Knocks the body back along the shot's `dir`; `force` is the weapon's recoil. */
  shove(dir: THREE.Vector3, force: number): void {
    const cfg = CONFIG.hitReaction;
    const len = Math.hypot(dir.x, dir.z) || 1;
    this.knock.x += (dir.x / len) * cfg.knockback * force;
    this.knock.z += (dir.z / len) * cfg.knockback * force;
    this.knock.clampLength(0, cfg.knockbackMax);
    this.stagger = Math.max(this.stagger, cfg.staggerTime * Math.min(1, force));
    this.recover = cfg.recoverTime;
  }

  /** Carries the body along its knockback, easing out. */
  private slide(dt: number): void {
    if (this.knock.lengthSq() < 1e-4) return;
    this.root.position.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-CONFIG.hitReaction.knockDamping * dt));
  }

  /** Speed multiplier: 0 while staggered, then back up to 1. */
  private staggerFactor(dt: number): number {
    if (this.stagger > 0) {
      this.stagger -= dt;
      return 0;
    }
    if (this.recover <= 0) return 1;
    this.recover = Math.max(0, this.recover - dt);
    return 1 - this.recover / CONFIG.hitReaction.recoverTime;
  }
}
