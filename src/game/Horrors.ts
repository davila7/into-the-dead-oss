import * as THREE from 'three';
import type { LoadedAssets, LoadedModel } from '../assets/manifest';
import { CONFIG } from './config';
import { applyHit, clamp, type HitPart, type HorrorPlan } from './logic';
import type { EnemyKind, HitResult, Shootable } from './Zombie';

const wood = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
const bark = new THREE.MeshLambertMaterial({ color: 0x241c15 });
const rope = new THREE.MeshLambertMaterial({ color: 0x6b5a3c });
const sack = new THREE.MeshLambertMaterial({ color: 0x75654a });
const skin = new THREE.MeshLambertMaterial({ color: 0x77806a });
const rags = new THREE.MeshLambertMaterial({ color: 0x3e3129 });
const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Tapered log from `a` to `b`. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** A standing figure made of boxes, feet at y=0, facing +Z; `spread` puts the arms out in a T. */
function placeholderFigure(spread: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.45, 0.62, 0.25, rags, 0, 1.2), box(0.28, 0.32, 0.28, sack, 0, 1.68));
  g.add(box(0.15, 0.85, 0.15, rags, -0.12, 0.45), box(0.15, 0.85, 0.15, rags, 0.12, 0.45));
  if (spread) g.add(box(1.7, 0.13, 0.13, skin, 0, 1.45));
  else g.add(box(0.12, 0.7, 0.12, skin, -0.31, 1.15), box(0.12, 0.7, 0.12, skin, 0.31, 1.15));
  return g;
}

function hitProxy(part: HitPart, owner: Shootable, geo: THREE.BufferGeometry): THREE.Mesh {
  const m = new THREE.Mesh(geo, proxyMaterial);
  m.userData.part = part;
  m.userData.zombie = owner;
  return m;
}

/** Figure for a set piece: the generated model or a box stand-in, with its height. */
function figure(model: LoadedModel | undefined, spread: boolean): { object: THREE.Object3D; size: THREE.Vector3 } {
  const object = model ? model.scene.clone(true) : placeholderFigure(spread);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  return { object, size };
}

abstract class SetPiece implements Shootable {
  readonly root = new THREE.Group();
  readonly hitMeshes: THREE.Mesh[] = [];
  protected health: number;
  protected time = Math.random() * 10;
  /** Seconds since death; < 0 while alive. */
  protected dead = -1;

  constructor(health: number) {
    this.health = health;
  }

  get alive(): boolean {
    return this.dead < 0;
  }

  /** Where the body is, for hit sounds and grabs. */
  abstract get position(): THREE.Vector3;

  hit(part: HitPart, point: THREE.Vector3, damage = 1): HitResult {
    const r = applyHit(this.health, part, damage);
    this.health = r.health;
    if (r.killed) this.dead = 0;
    else this.jolt();
    return { killed: r.killed, point, part };
  }

  protected abstract jolt(): void;
  abstract update(dt: number, player: THREE.Vector3): { grabbed: boolean; scream: boolean };
}

/**
 * A hooded body hanging from a dead tree over the field, swinging on its rope and twitching,
 * worse when someone comes close. Run underneath it and it grabs you; shoot it and the rope gives.
 */
class Hanged extends SetPiece {
  private readonly pivot = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly rope: THREE.Mesh;
  /** Swing angles (x: towards the runner, z: sideways) and their velocities. */
  private readonly swing = new THREE.Vector2((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
  private readonly spin = new THREE.Vector2();
  private twist = Math.random() * Math.PI * 2;
  private twistV = 0;
  private nextTwitch = Math.random() * 2;
  private fall = 0;
  private readonly world = new THREE.Vector3();
  private readonly ropeLength = 1.7;
  private readonly branchY = 4.2;
  private readonly bodyHeight: number;

  constructor(model: LoadedModel | undefined) {
    super(CONFIG.horrors.hanged.health);
    const side = Math.random() < 0.5 ? -1 : 1;
    // Gnarled trunk off to one side with a thick limb reaching out over the rope.
    const foot = new THREE.Vector3(side * 2.8, 0, -0.4);
    const top = new THREE.Vector3(side * 2.5, 5.6, -0.2);
    const fork = new THREE.Vector3(side * 2.6, this.branchY - 0.3, -0.3);
    const tip = new THREE.Vector3(-side * 0.8, this.branchY + 0.35, 0.1);
    this.root.add(
      limb(foot, top, 0.34, 0.14, bark),
      limb(fork, tip, 0.16, 0.05, bark),
      limb(top, top.clone().add(new THREE.Vector3(side * 1.1, 1.2, 0.3)), 0.1, 0.02, bark),
      limb(fork.clone().setY(4.6), new THREE.Vector3(side * 4.2, 5.5, -0.6), 0.1, 0.02, bark),
    );

    this.pivot.position.set(0, this.branchY, 0);
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, this.ropeLength, 4), rope);
    this.rope.position.y = -this.ropeLength / 2;
    const { object, size } = figure(model, false);
    this.bodyHeight = size.y;
    // Head at the end of the rope, feet dangling at a runner's knees.
    object.position.y = -size.y;
    this.body.position.y = -this.ropeLength;
    this.body.add(object);
    const head = hitProxy('head', this, new THREE.SphereGeometry(0.17, 8, 6));
    head.position.y = -size.y * 0.08;
    const torso = hitProxy('body', this, new THREE.BoxGeometry(0.5, size.y * 0.8, 0.35));
    torso.position.y = -size.y * 0.55;
    this.body.add(head, torso);
    this.hitMeshes.push(head, torso);
    this.pivot.add(this.rope, this.body);
    this.root.add(this.pivot);
  }

  get position(): THREE.Vector3 {
    return this.body.getWorldPosition(this.world).setY(1.4);
  }

  protected jolt(): void {
    this.spin.x += 1.2;
    this.twistV += (Math.random() - 0.5) * 4;
  }

  update(dt: number, player: THREE.Vector3): { grabbed: boolean; scream: boolean } {
    this.time += dt;
    if (!this.alive) {
      // The rope gives: a frayed end stays on the branch, the body drops and folds over.
      this.dead += dt;
      this.rope.scale.y = 0.3;
      this.rope.position.y = -this.ropeLength * 0.15;
      this.fall += dt * 9.8;
      this.body.rotation.x = Math.min(this.body.rotation.x + dt * 2.5, Math.PI / 2);
      const lying = this.body.rotation.x / (Math.PI / 2);
      const floor = -this.branchY + THREE.MathUtils.lerp(this.bodyHeight, 0.15, lying);
      this.body.position.y = Math.max(this.body.position.y - this.fall * dt, floor);
      this.swing.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.pivot.rotation.set(this.swing.x, this.twist, this.swing.y);
      return { grabbed: false, scream: false };
    }

    const near = Math.hypot(player.x - this.position.x, player.z - this.position.z);
    const agitation = clamp(1 - near / 14, 0, 1);
    // Damped pendulum with a slow breeze and the odd convulsion.
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) {
      const kick = 0.4 + agitation * 1.6;
      this.spin.x += (Math.random() - 0.5) * kick;
      this.spin.y += (Math.random() - 0.5) * kick;
      this.twistV += (Math.random() - 0.5) * kick * 2;
      this.nextTwitch = (0.6 + Math.random() * 2.2) * (1 - agitation * 0.7);
    }
    const k = 2.1;
    this.spin.x += (-k * this.swing.x - 0.25 * this.spin.x + Math.sin(this.time * 0.7) * 0.05) * dt;
    this.spin.y += (-k * this.swing.y - 0.25 * this.spin.y) * dt;
    this.swing.addScaledVector(this.spin, dt);
    this.swing.clampScalar(-0.6, 0.6);
    // The rope winds and unwinds; up close the hood turns to follow you.
    const toward = Math.atan2(player.x - this.root.position.x, player.z - this.root.position.z);
    const aim = agitation > 0.3 ? toward : Math.sin(this.time * 0.35) * 1.4;
    this.twistV += (THREE.MathUtils.euclideanModulo(aim - this.twist + Math.PI, Math.PI * 2) - Math.PI) * dt * (0.8 + agitation * 2);
    this.twistV *= Math.max(0, 1 - dt * 1.2);
    this.twist += this.twistV * dt;
    this.pivot.rotation.set(this.swing.x, this.twist, this.swing.y);
    // Legs jerk: a small shudder through the whole body.
    this.body.rotation.x = Math.sin(this.time * 17) * 0.03 * agitation;

    const grabbed = near < CONFIG.horrors.hanged.grabRadius;
    return { grabbed, scream: false };
  }
}

/**
 * A zombie tied to a cross out in the field, writhing, screaming at the runner going by.
 * It can't reach anyone; it's there to be seen (and shot).
 */
class Crucified extends SetPiece {
  private readonly body = new THREE.Group();
  private screamed = false;
  private thrash = 0;
  private readonly world = new THREE.Vector3();

  constructor(model: LoadedModel | undefined) {
    super(CONFIG.horrors.crucified.health);
    const { object, size } = figure(model, true);
    const lift = 0.5;
    // Arms of a T-pose sit at ~82% of the figure's height.
    const beamY = lift + size.y * 0.82;
    const span = Math.max(1.6, size.x * 1.15);
    this.root.add(
      box(0.2, beamY + 0.7, 0.2, wood, 0, (beamY + 0.7) / 2, -0.15),
      box(span, 0.18, 0.18, wood, 0, beamY, -0.12),
      // A mound of dirt at the base.
      new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 7), rags).translateY(0.17),
    );
    this.body.position.y = lift;
    this.body.add(object);
    const head = hitProxy('head', this, new THREE.SphereGeometry(0.17, 8, 6));
    head.position.y = size.y * 0.91;
    const torso = hitProxy('body', this, new THREE.BoxGeometry(0.55, size.y * 0.75, 0.35));
    torso.position.y = size.y * 0.45;
    this.body.add(head, torso);
    this.hitMeshes.push(head, torso);
    this.root.add(this.body);
    this.root.rotation.y = (Math.random() - 0.5) * 0.5;
  }

  get position(): THREE.Vector3 {
    return this.body.getWorldPosition(this.world).setY(1.8);
  }

  protected jolt(): void {
    this.thrash = 1;
  }

  update(dt: number, player: THREE.Vector3): { grabbed: boolean; scream: boolean } {
    this.time += dt;
    if (!this.alive) {
      // Slumps forward on its ropes and goes still.
      this.dead += dt;
      const k = clamp(dt * 3, 0, 1);
      this.body.rotation.set(THREE.MathUtils.lerp(this.body.rotation.x, 0.3, k), 0, THREE.MathUtils.lerp(this.body.rotation.z, 0.12, k));
      this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.35, k);
      return { grabbed: false, scream: false };
    }
    const near = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
    let scream = false;
    if (!this.screamed && near < CONFIG.horrors.crucified.screamDistance) {
      this.screamed = true;
      this.thrash = 1;
      scream = true;
    }
    if (Math.random() < dt * 0.4) this.thrash = Math.max(this.thrash, 0.5);
    this.thrash = Math.max(0, this.thrash - dt * 0.6);
    const t = this.time;
    const a = 0.25 + this.thrash;
    // Writhing against the ropes: hips twist, chest heaves, head rolls.
    this.body.rotation.z = Math.sin(t * 1.7) * 0.05 * a + Math.sin(t * 13) * 0.02 * this.thrash;
    this.body.rotation.y = Math.sin(t * 1.1 + 1) * 0.12 * a;
    this.body.rotation.x = Math.sin(t * 2.3) * 0.04 * a;
    this.body.scale.set(1, 1 + Math.sin(t * 3.1) * 0.012 * a, 1 + Math.sin(t * 3.1) * 0.03 * a);
    return { grabbed: false, scream };
  }
}

export interface HorrorEvents {
  /** Special zombies due now, in the order they should spawn. */
  spawns: { kind: EnemyKind; count: number }[];
  grabbed: boolean;
  /** Positions of set pieces that just started screaming. */
  screams: THREE.Vector3[];
}

/**
 * The later-level horrors: places the hanged and crucified set pieces ahead of the runner
 * and says when the brute, the mutant and the dog packs are due (the game spawns those).
 */
export class Horrors {
  private plan: HorrorPlan = { hanged: [], crucified: [], brutes: [], mutants: [], dogPacks: [] };
  private readonly next = { hanged: 0, crucified: 0, brutes: 0, mutants: 0, dogPacks: 0 };
  private readonly pieces: SetPiece[] = [];
  private readonly scene: THREE.Scene;
  private readonly assets: LoadedAssets;

  constructor(scene: THREE.Scene, assets: LoadedAssets) {
    this.scene = scene;
    this.assets = assets;
  }

  reset(plan: HorrorPlan): void {
    this.plan = plan;
    for (const key of Object.keys(this.next) as (keyof typeof this.next)[]) this.next[key] = 0;
    for (const p of this.pieces) this.scene.remove(p.root);
    this.pieces.length = 0;
  }

  /** Set pieces the gun can hit. */
  get targets(): Shootable[] {
    return this.pieces.filter((p) => p.alive);
  }

  update(dt: number, distance: number, player: THREE.Vector3): HorrorEvents {
    const { showAhead, spawnAhead } = CONFIG.horrors;
    const events: HorrorEvents = { spawns: [], grabbed: false, screams: [] };
    const { plan, next } = this;

    const place = (piece: SetPiece, at: number, x: number) => {
      // Offsets are relative to wherever the runner is when it comes into view.
      piece.root.position.set(player.x + x, 0, player.z - (at - distance));
      this.pieces.push(piece);
      this.scene.add(piece.root);
    };
    while (next.hanged < plan.hanged.length && plan.hanged[next.hanged].at - distance < showAhead) {
      const h = plan.hanged[next.hanged++];
      place(new Hanged(this.assets.horrors.hanged), h.at, h.x);
    }
    while (next.crucified < plan.crucified.length && plan.crucified[next.crucified].at - distance < showAhead) {
      const c = plan.crucified[next.crucified++];
      place(new Crucified(this.assets.horrors.crucified), c.at, c.x);
    }
    // Chasers spawn `spawnAhead` in front, so they're due that much before their mark.
    const due = distance + spawnAhead;
    while (next.brutes < plan.brutes.length && plan.brutes[next.brutes] < due) {
      next.brutes++;
      events.spawns.push({ kind: 'brute', count: 1 });
    }
    while (next.mutants < plan.mutants.length && plan.mutants[next.mutants] < due) {
      next.mutants++;
      events.spawns.push({ kind: 'mutant', count: 1 });
    }
    while (next.dogPacks < plan.dogPacks.length && plan.dogPacks[next.dogPacks].at < due) {
      events.spawns.push({ kind: 'dog', count: plan.dogPacks[next.dogPacks++].size });
    }

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const piece = this.pieces[i];
      const r = piece.update(dt, player);
      if (r.grabbed) events.grabbed = true;
      if (r.scream) events.screams.push(piece.position.clone());
      if (piece.root.position.z > player.z + 12) {
        this.scene.remove(piece.root);
        this.pieces.splice(i, 1);
      }
    }
    return events;
  }
}
