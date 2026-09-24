import * as THREE from 'three';
import { CONFIG } from './config';
import { applyHit, clamp, type HitPart, stepTowards } from './logic';

type ZombieState = 'walking' | 'lunging' | 'dying' | 'dead';

/** Geometry/material shared by every zombie; built once on first use. */
interface ZombieKit {
  head: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  limb: THREE.BufferGeometry;
  skins: THREE.MeshLambertMaterial[];
  clothes: THREE.MeshLambertMaterial[];
  pants: THREE.MeshLambertMaterial;
  eyes: THREE.MeshBasicMaterial;
  eye: THREE.BufferGeometry;
}

let kit: ZombieKit | undefined;

export function initZombieKit(skinTexture?: THREE.Texture): void {
  const limb = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  limb.translate(0, -0.4, 0); // pivot at the top (hip / shoulder)
  kit = {
    head: new THREE.BoxGeometry(0.3, 0.32, 0.3),
    torso: new THREE.BoxGeometry(0.5, 0.65, 0.28),
    limb,
    skins: [0x6f8a5c, 0x7d8f6a, 0x8a8f5f].map(
      (color) => new THREE.MeshLambertMaterial({ color, map: skinTexture ?? null }),
    ),
    clothes: [0x4a3b33, 0x2f3a4a, 0x5a2a2a, 0x3e3e3e].map((color) => new THREE.MeshLambertMaterial({ color })),
    pants: new THREE.MeshLambertMaterial({ color: 0x23262b }),
    eyes: new THREE.MeshBasicMaterial({ color: 0xd8ff6a, fog: false }),
    eye: new THREE.BoxGeometry(0.06, 0.03, 0.02),
  };
}

function getKit(): ZombieKit {
  if (!kit) initZombieKit();
  return kit!;
}

export interface HitResult {
  killed: boolean;
  point: THREE.Vector3;
  part: HitPart;
}

export class Zombie {
  readonly root = new THREE.Group();
  /** Meshes the gun raycasts against; each carries `userData.part`. */
  readonly hitMeshes: THREE.Mesh[] = [];

  state: ZombieState = 'walking';
  private health: number = CONFIG.gun.bodyHealth;
  private readonly speed: number;
  private phase = Math.random() * Math.PI * 2;
  private flinch = 0;
  private deathTime = 0;
  private yaw = 0;

  private readonly body = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly head: THREE.Mesh;

  constructor(x: number, z: number) {
    const k = getKit();
    const skin = k.skins[Math.floor(Math.random() * k.skins.length)];
    const shirt = k.clothes[Math.floor(Math.random() * k.clothes.length)];
    const z0 = CONFIG.zombies;
    this.speed = z0.walkSpeedMin + Math.random() * (z0.walkSpeedMax - z0.walkSpeedMin);

    const torso = this.part(k.torso, shirt, 'body');
    torso.position.y = 1.25;
    this.head = this.part(k.head, skin, 'head');
    this.head.position.y = 1.75;
    for (const ex of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(k.eye, k.eyes);
      eye.position.set(ex, 0.03, 0.155);
      this.head.add(eye);
    }

    this.legL.position.set(-0.13, 0.9, 0);
    this.legR.position.set(0.13, 0.9, 0);
    this.legL.add(this.part(k.limb, k.pants, 'body'));
    this.legR.add(this.part(k.limb, k.pants, 'body'));

    // Classic zombie pose: arms reaching forward (+Z faces the player).
    this.armL.position.set(-0.33, 1.52, 0);
    this.armR.position.set(0.33, 1.52, 0);
    this.armL.add(this.part(k.limb, skin, 'body'));
    this.armR.add(this.part(k.limb, skin, 'body'));

    this.body.add(torso, this.head, this.armL, this.armR);
    this.root.add(this.body, this.legL, this.legR);
    this.root.rotation.order = 'YXZ';
    this.root.position.set(x, 0, z);
    this.root.scale.setScalar(0.9 + Math.random() * 0.25);
  }

  private part(geo: THREE.BufferGeometry, mat: THREE.Material, part: HitPart): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.part = part;
    mesh.userData.zombie = this;
    this.hitMeshes.push(mesh);
    return mesh;
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

    const speed = (this.state === 'lunging' ? cfg.lungeSpeed : this.speed) * (this.flinch > 0 ? 0.2 : 1);
    const next = stepTowards(p.x, p.z, player.x, player.z, speed, dt);
    p.x = next.x;
    p.z = next.z;
    this.yaw = Math.atan2(player.x - p.x, player.z - p.z);
    this.root.rotation.y = this.yaw;

    this.animateWalk(dt, speed);
    return next.distance < CONFIG.player.grabRadius;
  }

  private animateWalk(dt: number, speed: number): void {
    this.phase += dt * (2 + speed * 2.2);
    const swing = Math.sin(this.phase) * 0.55;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    const reach = this.state === 'lunging' ? -1.75 : -1.45;
    this.armL.rotation.x = reach + Math.sin(this.phase * 0.5) * 0.12;
    this.armR.rotation.x = reach + Math.cos(this.phase * 0.5) * 0.12;
    this.body.rotation.z = Math.sin(this.phase) * 0.06;
    this.head.rotation.z = Math.sin(this.phase * 0.5) * 0.2;

    this.flinch = Math.max(0, this.flinch - dt);
    // Lean back briefly when shot.
    this.body.rotation.x = -this.flinch * 1.6;
  }

  private updateDeath(dt: number): void {
    this.deathTime += dt;
    const fall = clamp(this.deathTime / 0.45, 0, 1);
    // Ease-in fall backwards (away from the player).
    this.root.rotation.x = -(fall * fall) * (Math.PI / 2);
    this.root.position.y = 0.15 * fall;
    // Limbs go limp: arms flop overhead, legs straighten.
    const limp = clamp(dt * 8, 0, 1);
    this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -2.9, limp);
    this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -2.6, limp);
    this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, 0.1, limp);
    this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, -0.15, limp);
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, limp);
    if (this.deathTime > 4) this.root.position.y -= (this.deathTime - 4) * 0.5;
    if (this.deathTime > 6) this.state = 'dead';
  }

  hit(part: HitPart, point: THREE.Vector3): HitResult {
    const r = applyHit(this.health, part);
    this.health = r.health;
    if (r.killed) {
      this.state = 'dying';
      this.head.rotation.x = 0.4;
    } else {
      this.flinch = 0.25;
    }
    return { killed: r.killed, point, part };
  }
}
