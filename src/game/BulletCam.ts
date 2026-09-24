import * as THREE from 'three';
import { CONFIG } from './config';
import { clamp, lerp } from './logic';

const ALWAYS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bulletcam') === 'always';

/** Whether a headshot kill `distance` meters away gets the bullet cam, `clock` real seconds into the run. */
export function bulletCamDue(clock: number, nextAllowed: number, distance: number, roll: number, always = ALWAYS): boolean {
  const cfg = CONFIG.bulletCam;
  if (distance < cfg.minDistance) return false;
  if (always) return true;
  return clock >= nextAllowed && roll < cfg.chance;
}

/** Real seconds the bullet takes to reach a head `distance` meters away. */
export function flightTime(distance: number): number {
  const cfg = CONFIG.bulletCam;
  return clamp(distance * cfg.flightPerMeter, cfg.flightMin, cfg.flightMax);
}

function smooth(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Ultra slow-motion replay of a headshot: a bullet crawls from the muzzle to the head while the
 * camera spins round it and closes in, then circles the head as the zombie goes down.
 * It has its own camera; the game renders through it while `active`.
 */
export class BulletCam {
  readonly camera = new THREE.PerspectiveCamera(CONFIG.bulletCam.fovStart, 1, 0.02, 200);
  private readonly bullet = new THREE.Group();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  /** The head that was hit; the camera keeps it framed as the body goes down. */
  private target: THREE.Object3D | null = null;
  private clock = 0;
  private nextAllowed: number = CONFIG.bulletCam.firstAfter;
  private t = 0;
  private flight = 0;
  private struck = false;
  /** Called once when the bullet reaches the head. */
  private onImpact: (() => void) | null = null;

  constructor(scene: THREE.Scene) {
    // A brass round with a lead tip and a faint trail of disturbed air behind it.
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a045, metalness: 0.9, roughness: 0.3 });
    const lead = new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.7, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 16), brass);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 16), lead);
    tip.position.y = 0.016;
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.004, 0.22, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd8dde6, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    trail.position.y = -0.12;
    trail.rotation.x = Math.PI;
    // Built along +Y; tipped onto +Z so lookAt aims it down the flight path.
    const round = new THREE.Group();
    round.add(body, tip, trail);
    round.rotation.x = Math.PI / 2;
    // A touch oversized so it reads on screen.
    round.scale.setScalar(1.6);
    this.bullet.add(round);
    const light = new THREE.PointLight(0xffd9a0, 0.6, 1.2);
    this.bullet.add(light);
    this.bullet.visible = false;
    scene.add(this.bullet);
  }

  get active(): boolean {
    return this.flight > 0;
  }

  /** Multiplier for the game's delta time while the replay runs. */
  get timeScale(): number {
    if (!this.active) return 1;
    const cfg = CONFIG.bulletCam;
    return this.struck ? cfg.impactTimeScale : cfg.flightTimeScale;
  }

  /** Rolls for a replay of a headshot kill from `muzzle` to `head` (a point on `target`); returns true if it starts. */
  tryStart(muzzle: THREE.Vector3, head: THREE.Vector3, target: THREE.Object3D, onImpact: () => void): boolean {
    if (this.active) return false;
    const distance = muzzle.distanceTo(head);
    if (!bulletCamDue(this.clock, this.nextAllowed, distance, Math.random())) return false;
    this.from.copy(muzzle);
    this.to.copy(head);
    this.dir.subVectors(head, muzzle).normalize();
    // Any axis square to the flight path to swing the camera round.
    this.side.crossVectors(this.dir, Math.abs(this.dir.y) > 0.9 ? THREE.Object3D.DEFAULT_UP : this.tmp.set(0, 1, 0)).normalize();
    this.up.crossVectors(this.side, this.dir).normalize();
    this.flight = flightTime(distance);
    this.t = 0;
    this.struck = false;
    this.onImpact = onImpact;
    this.target = target;
    this.bullet.visible = true;
    this.pose();
    return true;
  }

  update(realDt: number): void {
    this.clock += realDt;
    if (!this.active) return;
    this.t += realDt;
    if (!this.struck && this.t >= this.flight) {
      this.struck = true;
      this.bullet.visible = false;
      this.onImpact?.();
      this.onImpact = null;
    }
    if (this.t >= this.flight + CONFIG.bulletCam.impactTime) this.stop();
    else this.pose();
  }

  /** Ends the replay at once (the bullet still lands if it hadn't). */
  stop(): void {
    if (!this.active) return;
    this.onImpact?.();
    this.onImpact = null;
    this.flight = 0;
    this.target = null;
    this.bullet.visible = false;
    this.nextAllowed = this.clock + CONFIG.bulletCam.cooldown;
  }

  reset(): void {
    this.onImpact = null;
    this.stop();
    this.clock = 0;
    this.nextAllowed = CONFIG.bulletCam.firstAfter;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private pose(): void {
    const cfg = CONFIG.bulletCam;
    const cam = this.camera;
    if (!this.struck) {
      // Ride alongside the bullet, spinning round it and closing in as it nears the head.
      const u = clamp(this.t / this.flight, 0, 1);
      const bullet = this.at.lerpVectors(this.from, this.to, u);
      this.bullet.position.copy(bullet);
      this.bullet.lookAt(this.tmp.copy(bullet).add(this.dir));
      const angle = u * cfg.spins * Math.PI * 2;
      const radius = lerp(0.5, 0.14, smooth(u));
      const back = lerp(0.9, 0.22, smooth(u));
      cam.position
        .copy(bullet)
        .addScaledVector(this.dir, -back)
        .addScaledVector(this.side, Math.cos(angle) * radius)
        .addScaledVector(this.up, Math.sin(angle) * radius);
      // A gentle roll with the spin; the horizon never tips far enough to lose the target.
      cam.up.set(0, 1, 0).applyAxisAngle(this.dir, Math.sin(angle) * 0.3);
      // Look past the bullet towards the head, so the round sits off-centre and the head grows in the middle.
      const ahead = Math.min(2.5, this.from.distanceTo(this.to) * (1 - u));
      cam.lookAt(this.tmp.copy(bullet).addScaledVector(this.dir, Math.max(0.15, ahead)));
      cam.fov = lerp(cfg.fovStart, cfg.fovImpact, smooth(u));
    } else {
      // Cut to the side of the head, outside the blood mist, and circle it as the zombie goes down.
      const v = clamp((this.t - this.flight) / cfg.impactTime, 0, 1);
      const flat = this.tmp.set(this.dir.x, 0, this.dir.z).normalize();
      const angle = 0.9 + smooth(v) * 1.0;
      const radius = lerp(1.5, 2.4, smooth(v));
      // Follow the head as the body is knocked back and drops.
      if (this.target) this.target.getWorldPosition(this.focus);
      else this.focus.copy(this.to);
      cam.position
        .copy(this.focus)
        .addScaledVector(flat, -Math.cos(angle) * radius)
        .add(this.at.set(-flat.z, 0, flat.x).multiplyScalar(Math.sin(angle) * radius));
      cam.position.y = Math.max(0.3, this.focus.y + 0.5);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.focus);
      cam.fov = lerp(cfg.fovImpact, cfg.fovEnd, smooth(v));
    }
    cam.updateProjectionMatrix();
  }
}
