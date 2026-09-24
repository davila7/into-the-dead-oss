import * as THREE from 'three';
import type { LoadedModel } from '../assets/manifest';
import { CONFIG } from './config';
import { clamp, lerp, playerSpeed } from './logic';

/** First-person runner: auto-advances towards -Z, steers on X, carries a pistol. */
export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3();
  distance = 0;

  ammo: number = CONFIG.gun.magazine;
  reloadLeft = 0;
  private cooldown = 0;
  private strafeVel = 0;
  private bob = 0;
  private recoil = 0;

  private readonly gun = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly flash: THREE.Mesh;
  private readonly flashLight = new THREE.PointLight(0xffc680, 0, 12, 2);
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number, weapon?: LoadedModel) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.05, 200);

    const metal = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
    const grip = new THREE.MeshLambertMaterial({ color: 0x4a3526 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xb58a6a });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.17), metal);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.004, -0.095);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.045), grip);
    handle.position.set(0, -0.055, 0.05);
    handle.rotation.x = -0.25;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.08), skin);
    hand.position.set(0.005, -0.07, 0.07);
    if (weapon) {
      // Generated hand + pistol: centre it on the grip position and keep the muzzle at its front.
      const model = weapon.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.sub(centre);
      model.position.y -= 0.03;
      this.gun.add(model);
      this.muzzle.position.set(0, 0.01, box.min.z - centre.z);
    } else {
      this.gun.add(slide, barrel, handle, hand);
      this.muzzle.position.set(0, 0.004, -0.11);
    }
    this.gun.add(this.muzzle);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.muzzle.add(this.flash, this.flashLight);

    this.gun.position.set(0.17, -0.16, -0.42);
    this.camera.add(this.gun);
    this.reset();
  }

  set gunVisible(visible: boolean) {
    this.gun.visible = visible;
  }

  reset(): void {
    this.gun.visible = true;
    this.position.set(0, CONFIG.player.eyeHeight, 0);
    this.distance = 0;
    this.ammo = CONFIG.gun.magazine;
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.strafeVel = 0;
    this.recoil = 0;
    this.syncCamera();
  }

  get speed(): number {
    return playerSpeed(this.distance);
  }

  update(dt: number, steer: number): void {
    const cfg = CONFIG.player;
    const forward = this.speed * dt;
    this.position.z -= forward;
    this.distance += forward;

    // Ease strafe velocity for a less twitchy feel.
    this.strafeVel = lerp(this.strafeVel, steer * cfg.strafeSpeed, clamp(dt * 10, 0, 1));
    this.position.x = clamp(this.position.x + this.strafeVel * dt, -cfg.laneHalfWidth, cfg.laneHalfWidth);

    this.bob += dt * this.speed * 1.6;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);

    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = CONFIG.gun.magazine;
      }
    }

    const flashOn = this.recoil > 0.75;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = flashOn ? 1 : 0;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flashLight.intensity = flashOn ? 6 : 0;

    this.syncCamera();
  }

  private syncCamera(): void {
    const c = this.camera;
    c.position.set(this.position.x, this.position.y + Math.abs(Math.sin(this.bob)) * 0.06, this.position.z);
    c.rotation.set(this.recoil * 0.05, 0, -this.strafeVel * 0.008 + Math.sin(this.bob) * 0.004);

    // Gun sway + recoil kick + dip while reloading.
    const reloadDip = this.reloadLeft > 0 ? Math.sin((this.reloadLeft / CONFIG.gun.reloadTime) * Math.PI) * 0.25 : 0;
    this.gun.position.set(
      0.17 + Math.sin(this.bob) * 0.008,
      -0.16 - Math.abs(Math.cos(this.bob)) * 0.008 - reloadDip * 0.6,
      -0.42 + this.recoil * 0.04,
    );
    this.gun.rotation.set(this.recoil * 0.35 + reloadDip * 2, 0, 0);
  }

  /** Points the pistol at a world-space target so it tracks the crosshair. */
  aimAt(target: THREE.Vector3): void {
    const local = this.camera.worldToLocal(this.tmp.copy(target));
    // Partial, clamped tracking: enough to read as aiming without swinging the gun sideways.
    this.gun.rotation.y = clamp(Math.atan2(-local.x, -local.z) * 0.6, -0.3, 0.3);
    this.gun.rotation.x += clamp(Math.atan2(local.y, -local.z) * 0.6, -0.25, 0.25);
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.reloadLeft <= 0 && this.ammo > 0;
  }

  fire(): void {
    this.ammo -= 1;
    this.cooldown = CONFIG.gun.fireCooldown;
    this.recoil = 1;
  }

  /** Returns true if a reload actually started. */
  startReload(): boolean {
    if (this.reloadLeft > 0 || this.ammo === CONFIG.gun.magazine) return false;
    this.reloadLeft = CONFIG.gun.reloadTime;
    return true;
  }

  muzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }
}
