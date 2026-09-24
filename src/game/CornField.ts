import * as THREE from 'three';
import { CONFIG } from './config';
import type { CornStretch } from './logic';
import { mulberry32 } from './logic';
import { applyWind } from './WheatField';

/**
 * One corn plant: a tall stalk, drooping ribbon leaves, a tassel and an ear, merged
 * into a single geometry so a whole tile is one InstancedMesh. Near-black, blighted.
 */
function makeStalkGeometry(rand: () => number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const height = CONFIG.corn.height;

  const strip = (pts: THREE.Vector3[], widths: number[], side: THREE.Vector3, colorAt: (t: number) => THREE.Color) => {
    const base = positions.length / 3;
    pts.forEach((p, i) => {
      const w = widths[i] / 2;
      const c = colorAt(i / (pts.length - 1));
      positions.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };

  const stemLow = new THREE.Color(0x14120c);
  const stemHigh = new THREE.Color(0x26261a);
  const leafBase = new THREE.Color(0x161a10);
  const leafTip = new THREE.Color(0x3a3322);
  const tassel = new THREE.Color(0x4d412a);

  // Stalk: two crossed tapered strips.
  const stalkPts = [0, 0.25, 0.5, 0.75, 1].map((t) => new THREE.Vector3(0.03 * t * t, height * t, 0));
  const stalkW = [0.07, 0.06, 0.05, 0.04, 0.025];
  strip(stalkPts, stalkW, new THREE.Vector3(1, 0, 0), (t) => stemLow.clone().lerp(stemHigh, t));
  strip(stalkPts, stalkW, new THREE.Vector3(0, 0, 1), (t) => stemLow.clone().lerp(stemHigh, t));

  // Leaves: long ribbons that arch out and droop, alternating sides up the stalk.
  const leaves = 8;
  for (let i = 0; i < leaves; i++) {
    const y0 = height * (0.18 + (i / leaves) * 0.62) + (rand() - 0.5) * 0.1;
    const yaw = i * 2.4 + rand() * 0.6;
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const len = 0.55 + rand() * 0.45;
    const rise = 0.25 + rand() * 0.2;
    const pts: THREE.Vector3[] = [];
    const widths: number[] = [];
    const segs = 5;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // Up and out, then falling over past the midpoint.
      const out = len * t;
      const y = y0 + rise * Math.sin(t * Math.PI * 0.8) - t * t * (0.35 + rand() * 0.1);
      pts.push(new THREE.Vector3(dir.x * out, y, dir.z * out));
      widths.push(0.09 * Math.sin(Math.min(1, t * 1.4 + 0.15) * Math.PI) + 0.01);
    }
    // Tilt the blade so it is not paper-flat edge-on.
    side.y = 0.35;
    strip(pts, widths, side.normalize(), (t) => leafBase.clone().lerp(leafTip, t));
  }

  // Ear: a fat short spindle leaning off the stalk.
  const earY = height * 0.5;
  const earPts = [0, 0.5, 1].map((t) => new THREE.Vector3(0.05 + t * 0.06, earY + t * 0.24, 0.02));
  strip(earPts, [0.05, 0.08, 0.03], new THREE.Vector3(0, 0, 1), () => leafTip);
  strip(earPts, [0.05, 0.08, 0.03], new THREE.Vector3(1, 0, 0), () => leafTip);

  // Tassel: a few thin spikes splaying from the top.
  for (let i = 0; i < 5; i++) {
    const yaw = rand() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const pts = [0, 0.5, 1].map((t) => new THREE.Vector3(dir.x * t * 0.18, height + t * 0.3 - t * t * 0.08, dir.z * t * 0.18));
    strip(pts, [0.02, 0.015, 0.005], new THREE.Vector3(-dir.z, 0, dir.x), () => tassel);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface Tile {
  mesh: THREE.InstancedMesh;
  /** z of the tile's forward edge (the tile spans [startZ - len, startZ]). */
  startZ: number;
}

/**
 * Tall blackened corn that only grows over the planned corn stretches. Tiles recycle
 * ahead of the player like the wheat; instances outside a stretch are collapsed.
 */
export class CornField {
  private readonly tiles: Tile[] = [];
  private readonly rand = mulberry32(4242);
  private nextStartZ: number = CONFIG.corn.tileLength;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private stretches: readonly CornStretch[] = [];

  constructor(scene: THREE.Scene, density: number) {
    const cfg = CONFIG.corn;
    const rand = mulberry32(8);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    applyWind(mat, cfg.height, 1.6, cfg.halfWidth);
    const count = Math.round(cfg.stalksPerTile * density);
    const geos = [makeStalkGeometry(rand), makeStalkGeometry(rand)];
    for (let i = 0; i < cfg.tileCount; i++) {
      const mesh = new THREE.InstancedMesh(geos[i % geos.length], mat, count);
      mesh.frustumCulled = false;
      const tile = { mesh, startZ: 0 };
      this.tiles.push(tile);
      scene.add(mesh);
    }
  }

  /** How far (m) past the nearest stretch edge a distance lies; negative outside. */
  private depthInto(distance: number): number {
    let best = -Infinity;
    for (const s of this.stretches) best = Math.max(best, Math.min(distance - s.start, s.end - distance));
    return best;
  }

  private place(tile: Tile): void {
    const { tileLength, halfWidth } = CONFIG.corn;
    tile.startZ = this.nextStartZ;
    this.nextStartZ -= tileLength;
    tile.mesh.position.set(0, 0, tile.startZ - tileLength / 2);
    const r = this.rand;
    let any = false;
    for (let i = 0; i < tile.mesh.count; i++) {
      // Even spread; the shader wraps stalks sideways around the runner.
      const x = (r() * 2 - 1) * halfWidth;
      const z = (r() - 0.5) * tileLength;
      const depth = this.depthInto(-(tile.mesh.position.z + z));
      // Ragged edges: the first few meters thin out instead of starting as a wall.
      const keep = depth > 0 && r() < Math.min(1, 0.25 + depth / 5);
      const s = keep ? 0.85 + r() * 0.35 : 0;
      any ||= keep;
      this.dummy.position.set(x, 0, z);
      this.dummy.rotation.set((r() - 0.5) * 0.12, r() * Math.PI * 2, (r() - 0.5) * 0.12);
      this.dummy.scale.set(s, s * (0.85 + r() * 0.3), s);
      this.dummy.updateMatrix();
      tile.mesh.setMatrixAt(i, this.dummy.matrix);
      this.tint.setHSL(0.12 + r() * 0.08, 0.2 + r() * 0.2, 0.35 + r() * 0.3);
      tile.mesh.setColorAt(i, this.tint);
    }
    tile.mesh.visible = any;
    tile.mesh.instanceMatrix.needsUpdate = true;
    if (tile.mesh.instanceColor) tile.mesh.instanceColor.needsUpdate = true;
  }

  update(player: THREE.Vector3): void {
    const len = CONFIG.corn.tileLength;
    for (const tile of this.tiles) {
      if (tile.startZ - len > player.z + 3) this.place(tile);
    }
  }

  reset(stretches: readonly CornStretch[]): void {
    this.stretches = stretches;
    this.nextStartZ = CONFIG.corn.tileLength;
    for (const tile of this.tiles) this.place(tile);
  }
}
