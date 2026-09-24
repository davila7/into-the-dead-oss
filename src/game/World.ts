import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LoadedAssets, LoadedModel } from '../assets/manifest';
import { CONFIG } from './config';
import { mulberry32, wrapAround } from './logic';

/** Dark ploughed soil with straw litter, used until a generated texture is provided. */
function makeGroundTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2a241a';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(7);
  // Furrows.
  for (let y = 0; y < size; y += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y, size, 3);
  }
  for (let i = 0; i < 2500; i++) {
    const shade = 40 + rand() * 50;
    ctx.fillStyle = `rgba(${shade * 1.1}, ${shade * 0.95}, ${shade * 0.6}, 0.5)`;
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.rotate(rand() * Math.PI);
    ctx.fillRect(0, 0, 2 + rand() * 6, 1);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 10);
  return tex;
}

/** A gnarled leafless tree from tapered cylinders, merged into one geometry. */
function makeDeadTreeGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const branch = (start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number) => {
    const geo = new THREE.CylinderGeometry(radius * 0.6, radius, length, 5, 1);
    geo.translate(0, length / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    geo.translate(start.x, start.y, start.z);
    parts.push(geo);
    if (depth === 0) return;
    const end = start.clone().addScaledVector(dir, length);
    const kids = depth === 3 ? 3 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < kids; i++) {
      const d = dir
        .clone()
        .add(new THREE.Vector3((rand() - 0.5) * 1.6, rand() * 0.5, (rand() - 0.5) * 1.6))
        .normalize();
      const from = start.clone().addScaledVector(dir, length * (0.55 + rand() * 0.45));
      branch(i === 0 ? end : from, d, length * (0.55 + rand() * 0.2), radius * 0.6, depth - 1);
    }
  };

  branch(new THREE.Vector3(), new THREE.Vector3((rand() - 0.5) * 0.2, 1, (rand() - 0.5) * 0.2).normalize(), 3.2, 0.32, 3);
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  merged.computeVertexNormals();
  return merged;
}

/** Burlap-headed scarecrow on a post. */
function makeScarecrow(): THREE.Group {
  const wood = new THREE.MeshLambertMaterial({ color: 0x3b2c1d });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x5a3326 });
  const sack = new THREE.MeshLambertMaterial({ color: 0x7a6a48 });
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), wood);
  post.position.y = 1.3;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), wood);
  bar.position.y = 2.0;
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.25), cloth);
  shirt.position.y = 1.75;
  const sleeves = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.2), cloth);
  sleeves.position.y = 2.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), sack);
  head.scale.set(1, 1.2, 1);
  head.position.y = 2.45;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.34, 0.22, 8), sack);
  hat.position.y = 2.68;
  g.add(post, bar, shirt, sleeves, head, hat);
  return g;
}

function cloneModel(model: LoadedModel): THREE.Object3D {
  return model.scene.clone(true);
}

interface Tile {
  group: THREE.Group;
  props: THREE.Object3D[];
  /** z of the tile's far (forward) edge; the tile spans [startZ - len, startZ]. */
  startZ: number;
}

/**
 * Ground plane plus the sparse props that break up the field: dead trees and the
 * odd scarecrow, recycled ahead of the player as they move forward (-Z).
 */
export class World {
  private readonly tiles: Tile[] = [];
  private readonly rand = mulberry32(1337);
  private nextStartZ: number = CONFIG.world.tileLength;
  private readonly ground: THREE.Mesh;

  constructor(scene: THREE.Scene, assets: LoadedAssets) {
    const { world } = CONFIG;
    const groundMat = new THREE.MeshLambertMaterial({ map: assets.textures.ground ?? makeGroundTexture() });
    // One large ground plane that follows the player; the texture scrolls with world Z.
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    scene.add(this.ground);

    const treeMat = new THREE.MeshLambertMaterial({ color: 0x241c15 });
    const treeGeos = [11, 23, 42].map(makeDeadTreeGeometry);
    const makeTree = (i: number): THREE.Object3D =>
      assets.trees.length > 0
        ? cloneModel(assets.trees[i % assets.trees.length])
        : new THREE.Mesh(treeGeos[i % treeGeos.length], treeMat);
    const makeCrow = (): THREE.Object3D => (assets.scarecrow ? cloneModel(assets.scarecrow) : makeScarecrow());

    for (let i = 0; i < world.tileCount; i++) {
      const group = new THREE.Group();
      const props: THREE.Object3D[] = [];
      for (let t = 0; t < world.treesPerTile; t++) props.push(makeTree(i * world.treesPerTile + t));
      const crow = makeCrow();
      crow.userData.scarecrow = true;
      props.push(crow);
      group.add(...props);
      const tile: Tile = { group, props, startZ: 0 };
      this.placeTile(tile, 0);
      this.tiles.push(tile);
      scene.add(group);
    }
  }

  private placeTile(tile: Tile, playerX: number): void {
    const len = CONFIG.world.tileLength;
    const { propHalfWidth, propClearance } = CONFIG.world;
    tile.startZ = this.nextStartZ;
    this.nextStartZ -= len;
    tile.group.position.set(0, 0, tile.startZ - len / 2);
    for (const prop of tile.props) {
      const r = this.rand;
      const isCrow = prop.userData.scarecrow === true;
      prop.visible = !isCrow || r() < CONFIG.world.scarecrowChance;
      // Anywhere across the field, but not right on the runner's current line.
      const side = r() < 0.5 ? -1 : 1;
      const x = playerX + side * (propClearance + r() * (propHalfWidth - propClearance));
      prop.position.set(x, 0, (r() - 0.5) * len);
      prop.rotation.y = isCrow ? (r() - 0.5) * 0.8 : r() * Math.PI * 2;
      const s = isCrow ? 1 : 0.8 + r() * 0.7;
      prop.scale.setScalar(s);
    }
  }

  update(player: THREE.Vector3): void {
    this.ground.position.set(player.x, 0, player.z);
    const map = (this.ground.material as THREE.MeshLambertMaterial).map;
    if (map) {
      // Keep the texture fixed to the world while the plane follows the player.
      map.offset.set((player.x / 240) * map.repeat.x, (-player.z / 240) * map.repeat.y);
    }
    const len = CONFIG.world.tileLength;
    const half = CONFIG.world.propHalfWidth;
    for (const tile of this.tiles) {
      if (tile.startZ - len > player.z + len) this.placeTile(tile, player.x);
      // Props wrap sideways around the runner, out in the fog, so the field never ends.
      for (const prop of tile.props) prop.position.x = wrapAround(prop.position.x, player.x, half);
    }
  }

  reset(): void {
    this.nextStartZ = CONFIG.world.tileLength;
    for (const tile of this.tiles) this.placeTile(tile, 0);
  }
}
