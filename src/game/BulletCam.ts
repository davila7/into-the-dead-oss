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

/** Real seconds the chase lasts for a head `distance` meters away (the side-on entry comes after). */
export function flightTime(distance: number): number {
  const cfg = CONFIG.bulletCam;
  return clamp(distance * cfg.flightPerMeter, cfg.flightMin, cfg.flightMax);
}

function smooth(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

type Phase = 'flight' | 'entry' | 'after';

/** Where the replay is `t` real seconds in, for a chase lasting `flight` seconds. */
export function bulletCamPhase(t: number, flight: number): { phase: Phase; u: number } | null {
  const cfg = CONFIG.bulletCam;
  if (t < flight) return { phase: 'flight', u: t / flight };
  if (t < flight + cfg.entryTime) return { phase: 'entry', u: (t - flight) / cfg.entryTime };
  if (t < flight + cfg.entryTime + cfg.impactTime) return { phase: 'after', u: (t - flight - cfg.entryTime) / cfg.impactTime };
  return null;
}

/** Bullet position during the entry, in meters past the head (negative: still on its way). */
export function entryOffset(u: number): number {
  const cfg = CONFIG.bulletCam;
  if (u < cfg.entryHit) return -cfg.entryLead * (1 - u / cfg.entryHit);
  // Slowing as it sinks in.
  return cfg.entryDepth * Math.sin(((u - cfg.entryHit) / (1 - cfg.entryHit)) * (Math.PI / 2));
}

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
}

/**
 * Ultra slow-motion replay of a headshot: a bullet crawls from the muzzle towards the head,
 * shedding rings of disturbed air, while the camera spins round it and closes in. It cuts
 * side-on for the last stretch to watch it go into the head, then circles the head as the
 * zombie goes down. It has its own camera; the game renders through it while `active`.
 */
export class BulletCam {
  readonly camera = new THREE.PerspectiveCamera(CONFIG.bulletCam.fovStart, 1, 0.02, 200);
  private readonly bullet = new THREE.Group();
  private readonly rings: Ring[] = [];
  private nextRing = 0;
  private ringTimer = 0;
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
  private running = false;
  private struck = false;
  /** Called once when the bullet reaches the head. */
  private onImpact: (() => void) | null = null;

  constructor(scene: THREE.Scene) {
    // A brass round with a lead tip, a bow shock round its nose and a wake of disturbed air.
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a045, metalness: 0.9, roughness: 0.3 });
    const lead = new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.7, roughness: 0.35 });
    const air = (opacity: number) =>
      new THREE.MeshBasicMaterial({ color: 0xdfe6f0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 16), brass);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 16), lead);
    tip.position.y = 0.016;
    const bowShock = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 32, 1, true), air(0.1));
    bowShock.position.y = 0.022 - 0.0225;
    const wake = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.3, 16, 1, true), air(0.07));
    wake.position.y = -0.16;
    wake.rotation.x = Math.PI;
    // Built along +Y; tipped onto +Z so lookAt aims it down the flight path.
    const round = new THREE.Group();
    round.add(body, tip, bowShock, wake);
    round.rotation.x = Math.PI / 2;
    // A touch oversized so it reads on screen.
    round.scale.setScalar(1.6);
    this.bullet.add(round);
    this.bullet.add(new THREE.PointLight(0xffd9a0, 0.8, 1.5));
    this.bullet.visible = false;
    scene.add(this.bullet);

    const ringGeometry = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(ringGeometry, air(0));
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0 });
    }
  }

  get active(): boolean {
    return this.running;
  }

  /** Multiplier for the game's delta time while the replay runs. */
  get timeScale(): number {
    if (!this.running) return 1;
    const cfg = CONFIG.bulletCam;
    const phase = bulletCamPhase(this.t, this.flight)?.phase;
    if (phase === 'after') return cfg.impactTimeScale;
    return this.struck ? cfg.entryTimeScale : cfg.flightTimeScale;
  }

  /** Rolls for a replay of a headshot kill from `muzzle` to `head` (a point on `target`); returns true if it starts. */
  tryStart(muzzle: THREE.Vector3, head: THREE.Vector3, target: THREE.Object3D, onImpact: () => void): boolean {
    if (this.running) return false;
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
    this.ringTimer = 0;
    this.running = true;
    this.struck = false;
    this.onImpact = onImpact;
    this.target = target;
    this.bullet.visible = true;
    this.pose();
    return true;
  }

  update(realDt: number): void {
    this.clock += realDt;
    this.updateRings(realDt);
    if (!this.running) return;
    this.t += realDt;
    if (!bulletCamPhase(this.t, this.flight)) this.stop();
    else this.pose();
  }

  /** Ends the replay at once (the bullet still lands if it hadn't). */
  stop(): void {
    if (!this.running) return;
    this.impact();
    this.running = false;
    this.target = null;
    this.bullet.visible = false;
    for (const r of this.rings) r.mesh.visible = false;
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

  private impact(): void {
    this.struck = true;
    this.onImpact?.();
    this.onImpact = null;
  }

  /** Sheds a ring of air at the bullet now and then; each one swells and fades where it was left. */
  private updateRings(realDt: number): void {
    const cfg = CONFIG.bulletCam;
    if (this.running && this.bullet.visible && !this.struck) {
      this.ringTimer -= realDt;
      if (this.ringTimer <= 0) {
        this.ringTimer = cfg.ringInterval;
        const r = this.rings[this.nextRing];
        this.nextRing = (this.nextRing + 1) % this.rings.length;
        r.life = cfg.ringLife;
        r.mesh.visible = true;
        r.mesh.position.copy(this.bullet.position).addScaledVector(this.dir, -0.02);
        r.mesh.lookAt(this.tmp.copy(r.mesh.position).add(this.dir));
      }
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life -= realDt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const age = 1 - r.life / cfg.ringLife;
      r.mesh.scale.setScalar(0.012 + cfg.ringSize * Math.sqrt(age));
      r.mesh.material.opacity = 0.25 * (1 - age) * Math.min(1, age * 6);
    }
  }

  private pose(): void {
    const cfg = CONFIG.bulletCam;
    const cam = this.camera;
    const now = bulletCamPhase(this.t, this.flight);
    if (!now) return;
    if (now.phase === 'flight') {
      // Ride alongside the bullet, spinning round it and closing in as it nears the head.
      const u = now.u;
      const entryStart = this.tmp.copy(this.to).addScaledVector(this.dir, -cfg.entryLead);
      const bullet = this.at.lerpVectors(this.from, entryStart, u);
      this.placeBullet(bullet);
      const angle = u * cfg.spins * Math.PI * 2;
      const radius = lerp(0.5, 0.16, smooth(u));
      const back = lerp(0.9, 0.3, smooth(u));
      cam.position
        .copy(bullet)
        .addScaledVector(this.dir, -back)
        .addScaledVector(this.side, Math.cos(angle) * radius)
        .addScaledVector(this.up, Math.sin(angle) * radius);
      // A gentle roll with the spin; the horizon never tips far enough to lose the target.
      cam.up.set(0, 1, 0).applyAxisAngle(this.dir, Math.sin(angle) * 0.3);
      // Look past the bullet towards the head, so the round sits off-centre and the head grows in the middle.
      const ahead = Math.min(2.5, bullet.distanceTo(this.to));
      cam.lookAt(this.tmp.copy(bullet).addScaledVector(this.dir, Math.max(0.15, ahead)));
      cam.fov = lerp(cfg.fovStart, cfg.fovImpact, smooth(u));
    } else if (now.phase === 'entry') {
      // Cut side-on to the head and watch the bullet creep in and sink into it.
      const offset = entryOffset(now.u);
      if (offset >= 0 && !this.struck) this.impact();
      const bullet = this.at.copy(this.to).addScaledVector(this.dir, offset);
      this.placeBullet(bullet);
      const flat = this.focus.set(-this.dir.z, 0, this.dir.x).normalize();
      const dolly = lerp(1.15, 0.9, smooth(now.u));
      cam.position
        .copy(this.to)
        .addScaledVector(this.dir, -0.3)
        .addScaledVector(flat, dolly);
      cam.position.y += 0.06;
      cam.up.set(0, 1, 0);
      cam.lookAt(this.tmp.copy(this.to).addScaledVector(this.dir, -0.32));
      cam.fov = cfg.fovImpact;
      // Once inside, the head hides it; drop it before it could poke out the back.
      this.bullet.visible = offset < cfg.entryDepth * 0.95;
    } else {
      // Circle the head as the zombie goes down, easing back out.
      this.bullet.visible = false;
      const v = now.u;
      const flat = this.tmp.set(this.dir.x, 0, this.dir.z).normalize();
      const angle = Math.PI / 2 + smooth(v) * 1.0;
      const radius = lerp(1.4, 2.4, smooth(v));
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

  private placeBullet(at: THREE.Vector3): void {
    this.bullet.position.copy(at);
    this.bullet.lookAt(this.tmp.copy(at).add(this.dir));
  }
}
