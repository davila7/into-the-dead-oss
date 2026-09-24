import * as THREE from 'three';
import type { LoadedAssets } from '../assets/manifest';
import { CONFIG } from './config';
import type { CoursePlan } from './logic';
import { mulberry32 } from './logic';
import { makePlaceholderGun } from './Player';
import { PICKUP_WEAPONS, type WeaponId } from './weapons';

/** How far ahead (m) fences and pickups are put in the scene. */
const SHOW_AHEAD = 90;

const rottenWood = new THREE.MeshLambertMaterial({ color: 0x17130f });

/** Two leaning posts and three rails, the middle one snapped. Rails along X, ~3 m wide. */
function makeFenceSection(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = CONFIG.fences.height;
  for (const x of [-1.5, 1.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, h + 0.1, 0.14), rottenWood);
    post.position.set(x, (h + 0.1) / 2, 0);
    post.rotation.z = (rand() - 0.5) * 0.25;
    g.add(post);
  }
  [0.35, 0.75, 1.15].forEach((y, i) => {
    if (i === 1) {
      // Snapped rail: two halves hanging from the posts.
      for (const side of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.05), rottenWood);
        half.geometry.translate((-side * 1.3) / 2, 0, 0);
        half.position.set(side * 1.45, y, 0.05);
        half.rotation.z = side * (0.35 + rand() * 0.3);
        g.add(half);
      }
      return;
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.11, 0.05), rottenWood);
    rail.position.set(0, y + (rand() - 0.5) * 0.08, 0.05);
    rail.rotation.z = (rand() - 0.5) * 0.08;
    g.add(rail);
  });
  return g;
}

/** Sections in the repeating tilt pattern; the row slides sideways by whole patterns. */
const FENCE_PATTERN = 4;

/**
 * A row of broken fence sections wide enough to fill the view. The sag and lean repeat every
 * FENCE_PATTERN sections, so the row can follow the runner sideways in whole-pattern steps
 * without anything visibly jumping. `userData.period` is that step in meters.
 */
function makeFenceRow(assets: LoadedAssets, rand: () => number): THREE.Group {
  const row = new THREE.Group();
  const model = assets.fence;
  let width = 3;
  if (model) {
    const size = new THREE.Box3().setFromObject(model.scene).getSize(new THREE.Vector3());
    width = Math.max(1, size.x * 0.96);
  }
  const pattern = Array.from({ length: FENCE_PATTERN }, () => ({
    z: (rand() - 0.5) * 0.25,
    y: -rand() * 0.08,
    // Sagging, leaning, not quite in line.
    rx: (rand() - 0.5) * 0.12,
    ry: (rand() - 0.5) * 0.12 + (rand() < 0.5 ? 0 : Math.PI),
    rz: (rand() - 0.5) * 0.06,
    look: model ? undefined : makeFenceSection(rand),
  }));
  const count = Math.ceil((2 * CONFIG.fences.halfWidth) / width / FENCE_PATTERN) * FENCE_PATTERN;
  const start = (-count * width) / 2;
  for (let i = 0; i < count; i++) {
    const p = pattern[i % FENCE_PATTERN];
    const section = model ? model.scene.clone(true) : p.look!.clone(true);
    section.position.set(start + i * width + width / 2, p.y, p.z);
    section.rotation.set(p.rx, p.ry, p.rz);
    row.add(section);
  }
  row.userData.period = width * FENCE_PATTERN;
  return row;
}

/** A dim yellow beam so a weapon lying in the field reads through the fog. */
function makeBeam(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.18, 0.35, 14, 12, 1, true);
  geo.translate(0, 7, 0);
  const colors: number[] = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const fade = 1 - pos.getY(i) / 14;
    colors.push(fade, fade * 0.82, fade * 0.45);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
}

export interface Pickup {
  weapon: WeaponId;
  at: number;
  x: number;
}

/**
 * Places the planned fences and weapon pickups in front of the player and tells the game
 * when the runner reaches one.
 */
export class Course {
  private plan: CoursePlan = { fences: [], corn: [], pickups: [] };
  private readonly rand = mulberry32(77);
  private readonly fenceRows: THREE.Group[] = [];
  private nextFence = 0;
  private fenceRow?: THREE.Group;
  private fenceAt = 0;
  private vaulted = false;

  private nextPickup = 0;
  private readonly pickupRoot = new THREE.Group();
  private readonly pickupModels = new Map<WeaponId, THREE.Object3D>();
  private readonly pickupHolder = new THREE.Group();
  pickup: Pickup | null = null;

  constructor(
    scene: THREE.Scene,
    assets: LoadedAssets,
    /** Picks the weapon a pickup offers (not the one already carried). */
    private readonly chooseWeapon: () => WeaponId,
  ) {
    for (let i = 0; i < 2; i++) {
      const row = makeFenceRow(assets, this.rand);
      row.visible = false;
      this.fenceRows.push(row);
      scene.add(row);
    }

    for (const id of PICKUP_WEAPONS) {
      const model = assets.pickups[id];
      let obj: THREE.Object3D;
      if (model) {
        obj = model.scene.clone(true);
        const box = new THREE.Box3().setFromObject(obj);
        obj.position.sub(box.getCenter(new THREE.Vector3()));
      } else {
        // Placeholder viewmodels are ~0.5 m; scale them up to read at a distance.
        obj = makePlaceholderGun(id).group;
        obj.scale.setScalar(1.8);
      }
      const holder = new THREE.Group();
      holder.add(obj);
      this.pickupModels.set(id, holder);
    }
    const light = new THREE.PointLight(0xffd27a, 3, 7, 2);
    light.position.y = 0.6;
    this.pickupHolder.position.y = 0.95;
    this.pickupRoot.add(makeBeam(), light, this.pickupHolder);
    this.pickupRoot.visible = false;
    scene.add(this.pickupRoot);
  }

  get corn() {
    return this.plan.corn;
  }

  /** Distance of the fence currently in the scene, if any. */
  get activeFence(): number | null {
    return this.fenceRow ? this.fenceAt : null;
  }

  private fenceX(row: THREE.Group, playerX: number): number {
    const period = row.userData.period as number;
    return Math.round(playerX / period) * period;
  }

  reset(plan: CoursePlan): void {
    this.plan = plan;
    this.nextFence = 0;
    this.nextPickup = 0;
    this.fenceRow = undefined;
    for (const row of this.fenceRows) row.visible = false;
    this.clearPickup();
  }

  private clearPickup(): void {
    this.pickup = null;
    this.pickupRoot.visible = false;
  }

  /** Call once the player has dealt with (or run past) the current pickup. */
  consumePickup(): void {
    this.clearPickup();
  }

  /**
   * Advances fences and pickups. Returns 'vault' the frame the runner reaches a fence,
   * 'pickup' the frame they touch a weapon.
   */
  update(dt: number, distance: number, playerX: number): 'vault' | 'pickup' | null {
    let event: 'vault' | 'pickup' | null = null;

    // Fences.
    if (!this.fenceRow && this.nextFence < this.plan.fences.length) {
      const at = this.plan.fences[this.nextFence];
      if (at - distance < SHOW_AHEAD) {
        this.fenceRow = this.fenceRows[this.nextFence % this.fenceRows.length];
        this.fenceRow.position.set(this.fenceX(this.fenceRow, playerX), 0, -at);
        this.fenceRow.visible = true;
        this.fenceAt = at;
        this.vaulted = false;
        this.nextFence += 1;
      }
    }
    if (this.fenceRow) {
      // No way round: the row keeps itself centred on the runner.
      this.fenceRow.position.x = this.fenceX(this.fenceRow, playerX);
      if (!this.vaulted && distance >= this.fenceAt - 1.1) {
        this.vaulted = true;
        event = 'vault';
      }
      if (distance > this.fenceAt + 12) {
        this.fenceRow.visible = false;
        this.fenceRow = undefined;
      }
    }

    // Pickups.
    if (!this.pickup && this.nextPickup < this.plan.pickups.length) {
      const next = this.plan.pickups[this.nextPickup];
      if (next.at - distance < SHOW_AHEAD) {
        this.nextPickup += 1;
        const weapon = this.chooseWeapon();
        // Offsets are relative to wherever the runner is when it comes into view.
        this.pickup = { weapon, at: next.at, x: playerX + next.x };
        this.pickupHolder.clear();
        const model = this.pickupModels.get(weapon);
        if (model) this.pickupHolder.add(model);
        this.pickupRoot.position.set(this.pickup.x, 0, -next.at);
        this.pickupRoot.visible = true;
      }
    }
    if (this.pickup) {
      this.pickupHolder.rotation.y += dt * 1.6;
      this.pickupHolder.position.y = 0.95 + Math.sin(this.pickupHolder.rotation.y * 1.3) * 0.08;
      const r = CONFIG.pickups.radius;
      if (Math.abs(distance - this.pickup.at) < r && Math.abs(playerX - this.pickup.x) < r) {
        event ??= 'pickup';
      } else if (distance > this.pickup.at + 3) {
        this.clearPickup();
      }
    }
    return event;
  }
}
