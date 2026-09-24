import * as THREE from 'three';
import type { LoadedModel } from '../assets/manifest';
import { CONFIG } from './config';
import { clamp, lerp, playerSpeed, vaultProfile } from './logic';
import { MuzzleFlash } from './MuzzleFlash';
import { WEAPONS, type WeaponDef, type WeaponId } from './weapons';

/** Where each viewmodel sits in front of the camera (x right, y up, z forward = -). */
const HOLD: Record<WeaponId, [number, number, number]> = {
  pistol: [0.17, -0.16, -0.42],
  shotgun: [0.19, -0.2, -0.5],
  rifle: [0.19, -0.19, -0.52],
  smg: [0.18, -0.17, -0.45],
};

const SWAP_TIME = 0.5;

/** Box-and-cylinder stand-in for a weapon whose generated model is missing. Muzzle at -Z. */
export function makePlaceholderGun(id: WeaponId): { group: THREE.Group; muzzle: THREE.Vector3 } {
  const metal = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a3526 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  const tube = (r: number, len: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), metal);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, y, z);
    g.add(m);
  };
  box(0.06, 0.07, 0.08, skin, 0.005, -0.07, 0.07); // gloved hand
  switch (id) {
    case 'shotgun':
      tube(0.014, 0.6, 0.01, -0.22);
      box(0.04, 0.035, 0.16, wood, 0, -0.018, -0.2); // pump
      box(0.04, 0.05, 0.14, metal, 0, 0.005, 0.06);
      box(0.035, 0.07, 0.26, wood, 0, -0.03, 0.24, 0.12);
      return { group: g, muzzle: new THREE.Vector3(0, 0.01, -0.52) };
    case 'rifle':
      tube(0.009, 0.62, 0.012, -0.24);
      box(0.035, 0.03, 0.22, wood, 0, -0.012, -0.12);
      box(0.035, 0.045, 0.14, metal, 0, 0.005, 0.06);
      box(0.012, 0.05, 0.07, metal, 0, -0.045, 0.06); // lever
      box(0.032, 0.065, 0.28, wood, 0, -0.03, 0.26, 0.12);
      return { group: g, muzzle: new THREE.Vector3(0, 0.012, -0.55) };
    case 'smg':
      box(0.04, 0.055, 0.26, metal, 0, 0, -0.04);
      tube(0.01, 0.08, 0.005, -0.21);
      box(0.025, 0.12, 0.03, metal, 0, -0.08, -0.06); // magazine
      box(0.03, 0.08, 0.04, metal, 0, -0.05, 0.06, -0.25);
      return { group: g, muzzle: new THREE.Vector3(0, 0.005, -0.25) };
    default:
      box(0.035, 0.04, 0.17, metal, 0, 0, 0);
      tube(0.008, 0.03, 0.004, -0.095);
      box(0.03, 0.09, 0.045, wood, 0, -0.055, 0.05, -0.25);
      return { group: g, muzzle: new THREE.Vector3(0, 0.004, -0.11) };
  }
}

const FOV = 70;

/** First-person runner: auto-advances towards -Z, steers on X, carries one weapon. */
export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3();
  distance = 0;

  weapon: WeaponDef = WEAPONS.pistol;
  ammo = WEAPONS.pistol.magazine;
  reloadLeft = 0;
  /** Set for the frame in which a footstep lands. */
  stepped = false;
  private cooldown = 0;
  private strafeVel = 0;
  private bob = 0;
  private recoil = 0;
  private swapLeft = 0;
  private vaultLeft = 0;

  private readonly gun = new THREE.Group();
  private readonly holder = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly flash = new MuzzleFlash();
  private readonly tmp = new THREE.Vector3();
  private readonly viewmodels = new Map<WeaponId, { group: THREE.Object3D; muzzle: THREE.Vector3 }>();

  constructor(aspect: number, private readonly models: Partial<Record<WeaponId, LoadedModel>>) {
    this.camera = new THREE.PerspectiveCamera(FOV, aspect, 0.05, 200);

    this.muzzle.add(this.flash);
    this.gun.add(this.holder, this.muzzle);
    this.camera.add(this.gun);
    this.reset();
  }

  /** Narrows the field of view by `amount` (0..1) for the kill cam. */
  setZoom(amount: number): void {
    const fov = FOV * (1 - amount);
    if (fov === this.camera.fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  private viewmodel(id: WeaponId): { group: THREE.Object3D; muzzle: THREE.Vector3 } {
    let vm = this.viewmodels.get(id);
    if (vm) return vm;
    const model = this.models[id];
    if (model) {
      // Generated hand + weapon: centre it on the grip position and keep the muzzle at its front.
      const group = model.scene.clone(true);
      const box = new THREE.Box3().setFromObject(group);
      group.position.sub(box.getCenter(new THREE.Vector3()));
      group.position.y -= 0.03;
      // Unparented, so its own frame equals the holder frame the muzzle lives in.
      vm = { group, muzzle: findMuzzle(group, new THREE.Object3D()) };
    } else {
      vm = makePlaceholderGun(id);
    }
    this.viewmodels.set(id, vm);
    return vm;
  }

  /** Puts `def` in the player's hands with a full magazine. */
  equip(def: WeaponDef, animate = true): void {
    this.weapon = def;
    this.ammo = def.magazine;
    this.reloadLeft = 0;
    this.cooldown = animate ? SWAP_TIME * 0.6 : 0;
    this.swapLeft = animate ? SWAP_TIME : 0;
    this.holder.clear();
    const vm = this.viewmodel(def.id);
    this.holder.add(vm.group);
    this.muzzle.position.copy(vm.muzzle);
  }

  set gunVisible(visible: boolean) {
    this.gun.visible = visible;
  }

  get vaulting(): boolean {
    return this.vaultLeft > 0;
  }

  /** Starts the automatic climb over a fence. */
  vault(): void {
    this.vaultLeft = CONFIG.fences.vaultTime;
  }

  reset(): void {
    this.gun.visible = true;
    this.position.set(0, CONFIG.player.eyeHeight, 0);
    this.distance = 0;
    this.strafeVel = 0;
    this.recoil = 0;
    this.vaultLeft = 0;
    this.flash.reset();
    this.equip(WEAPONS.pistol, false);
    this.syncCamera();
  }

  get speed(): number {
    return playerSpeed(this.distance);
  }

  private get vaultProgress(): number {
    return this.vaultLeft > 0 ? 1 - this.vaultLeft / CONFIG.fences.vaultTime : 0;
  }

  update(dt: number, steer: number): void {
    const cfg = CONFIG.player;
    const vault = vaultProfile(this.vaultProgress);
    const forward = this.speed * vault.speed * dt;
    this.position.z -= forward;
    this.distance += forward;
    this.vaultLeft = Math.max(0, this.vaultLeft - dt);

    // Ease strafe velocity for a less twitchy feel; no steering mid-climb.
    const steerTarget = this.vaulting ? 0 : steer * cfg.strafeSpeed;
    this.strafeVel = lerp(this.strafeVel, steerTarget, clamp(dt * 10, 0, 1));
    // No side walls: the field wraps around the runner, so they can strafe as far as they like.
    this.position.x += this.strafeVel * dt;

    const lastStep = Math.floor(this.bob / Math.PI);
    if (!this.vaulting) this.bob += dt * this.speed * 1.6;
    this.stepped = Math.floor(this.bob / Math.PI) !== lastStep;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.swapLeft = Math.max(0, this.swapLeft - dt);

    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = this.weapon.magazine;
      }
    }

    this.flash.update(dt);

    this.syncCamera();
  }

  private syncCamera(): void {
    const c = this.camera;
    const vault = vaultProfile(this.vaultProgress);
    const lift = vault.lift * CONFIG.fences.vaultHeight;
    c.position.set(this.position.x, this.position.y + Math.abs(Math.sin(this.bob)) * 0.06 + lift, this.position.z);
    // Look down at the rail on the way up, then level out on landing.
    const vaultPitch = -Math.sin(this.vaultProgress * Math.PI) * 0.22;
    const kick = this.recoil * this.weapon.recoil;
    c.rotation.set(kick * 0.05 + vaultPitch, 0, -this.strafeVel * 0.008 + Math.sin(this.bob) * 0.004);

    // Gun sway + recoil kick + dip while reloading, swapping or climbing.
    const reloadDip = this.reloadLeft > 0 ? Math.sin((this.reloadLeft / this.weapon.reloadTime) * Math.PI) * 0.25 : 0;
    const swapDip = this.swapLeft > 0 ? Math.sin((this.swapLeft / SWAP_TIME) * Math.PI) * 0.35 : 0;
    const dip = reloadDip + swapDip + vault.lift * 0.15;
    const [hx, hy, hz] = HOLD[this.weapon.id];
    this.gun.position.set(
      hx + Math.sin(this.bob) * 0.008,
      hy - Math.abs(Math.cos(this.bob)) * 0.008 - dip * 0.6,
      hz + kick * 0.04,
    );
    this.gun.rotation.set(kick * 0.35 + dip * 2, 0, swapDip * 0.8);
  }

  /** Points the weapon at a world-space target so it tracks the crosshair. */
  aimAt(target: THREE.Vector3): void {
    const local = this.camera.worldToLocal(this.tmp.copy(target));
    // Partial, clamped tracking: enough to read as aiming without swinging the gun sideways.
    this.gun.rotation.y = clamp(Math.atan2(-local.x, -local.z) * 0.6, -0.3, 0.3);
    this.gun.rotation.x += clamp(Math.atan2(local.y, -local.z) * 0.6, -0.25, 0.25);
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.reloadLeft <= 0 && this.swapLeft <= 0 && this.ammo > 0;
  }

  fire(): void {
    this.ammo -= 1;
    this.cooldown = this.weapon.fireCooldown;
    this.recoil = 1;
    this.flash.fire(this.weapon.recoil);
  }

  /** Returns true if a reload actually started. */
  startReload(): boolean {
    if (this.reloadLeft > 0 || this.ammo === this.weapon.magazine) return false;
    this.reloadLeft = this.weapon.reloadTime;
    return true;
  }

  muzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }
}

/**
 * Barrel tip of a generated viewmodel, in `space` coordinates: the centre of the
 * vertices within 1 cm of the model's front-most (-Z) point.
 */
function findMuzzle(model: THREE.Object3D, space: THREE.Object3D): THREE.Vector3 {
  model.updateWorldMatrix(true, true);
  const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const points: THREE.Vector3[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const m = new THREE.Matrix4().multiplyMatrices(toSpace, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
  });
  if (points.length === 0) return new THREE.Vector3();
  const front = points.reduce((min, p) => Math.min(min, p.z), Infinity);
  const tip = points.filter((p) => p.z < front + 0.01);
  const sum = tip.reduce((acc, p) => acc.add(p), new THREE.Vector3());
  return sum.divideScalar(tip.length).setZ(front);
}
