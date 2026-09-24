import * as THREE from 'three';
import type { LoadedZombie } from '../assets/manifest';
import { CONFIG } from './config';
import { applyHit, clamp, type HitPart, stepTowards } from './logic';
import { ModelBody, PrimitiveBody, type ZombieBody } from './ZombieBody';

type ZombieState = 'walking' | 'lunging' | 'dying' | 'dead';

export interface HitResult {
  killed: boolean;
  point: THREE.Vector3;
  part: HitPart;
}

export class Zombie {
  readonly root = new THREE.Group();
  readonly body: ZombieBody;

  state: ZombieState = 'walking';
  private health: number = CONFIG.gun.bodyHealth;
  private readonly speed: number;
  private flinch = 0;
  private deathTime = 0;

  constructor(x: number, z: number, model?: LoadedZombie) {
    const cfg = CONFIG.zombies;
    this.speed = cfg.walkSpeedMin + Math.random() * (cfg.walkSpeedMax - cfg.walkSpeedMin);
    this.body = model ? new ModelBody(this, model) : new PrimitiveBody(this);
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
  update(dt: number, player: THREE.Vector3): boolean {
    if (!this.alive) {
      this.updateDeath(dt);
      return false;
    }

    const p = this.root.position;
    const dist = Math.hypot(player.x - p.x, player.z - p.z);
    const cfg = CONFIG.zombies;
    // Only lunge at a player that is still in front (the player moves towards -Z).
    if (this.state === 'walking' && dist < cfg.lungeDistance && p.z < player.z) this.state = 'lunging';

    const lunging = this.state === 'lunging';
    const speed = (lunging ? cfg.lungeSpeed : this.speed) * (this.flinch > 0 ? 0.2 : 1);
    const next = stepTowards(p.x, p.z, player.x, player.z, speed, dt);
    p.x = next.x;
    p.z = next.z;
    this.root.rotation.y = Math.atan2(player.x - p.x, player.z - p.z);

    this.flinch = Math.max(0, this.flinch - dt);
    this.body.animate(dt, speed, lunging, this.flinch);
    return next.distance < CONFIG.player.grabRadius;
  }

  private updateDeath(dt: number): void {
    this.deathTime += dt;
    const fall = clamp(this.deathTime / 0.45, 0, 1);
    // Ease-in fall backwards (away from the player).
    this.root.rotation.x = -(fall * fall) * (Math.PI / 2);
    this.root.position.y = 0.15 * fall;
    if (this.deathTime > 4) this.root.position.y -= (this.deathTime - 4) * 0.5;
    if (this.deathTime > 6) this.state = 'dead';
    this.body.animateDeath(dt);
  }

  hit(part: HitPart, point: THREE.Vector3): HitResult {
    const r = applyHit(this.health, part);
    this.health = r.health;
    if (r.killed) this.state = 'dying';
    else this.flinch = 0.25;
    return { killed: r.killed, point, part };
  }
}
