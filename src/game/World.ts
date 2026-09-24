import * as THREE from 'three';
import type { LoadedTextures } from '../assets/manifest';
import { CONFIG } from './config';
import { mulberry32 } from './logic';

/** Procedural dirt/grass texture used until a generated ground texture is provided. */
function makeGroundTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2c3324';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(7);
  for (let i = 0; i < 4000; i++) {
    const shade = 30 + rand() * 40;
    ctx.fillStyle = `rgb(${shade * 0.9}, ${shade * 1.05}, ${shade * 0.7})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(60, 45, 30, ${0.2 + rand() * 0.3})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 4 + rand() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

interface Tile {
  group: THREE.Group;
  trees: THREE.Group[];
  /** z of the tile's far (forward) edge. */
  startZ: number;
}

/**
 * Endless field: a ring of ground tiles with scattered trees that are recycled
 * ahead of the player as they move forward (-Z).
 */
export class World {
  readonly group = new THREE.Group();
  private readonly tiles: Tile[] = [];
  private readonly rand = mulberry32(1337);
  private nextStartZ: number = CONFIG.world.tileLength;

  constructor(scene: THREE.Scene, textures: LoadedTextures) {
    const { world } = CONFIG;
    scene.background = new THREE.Color(world.fogColor);
    scene.fog = new THREE.Fog(world.fogColor, world.fogNear, world.fogFar);

    if (textures.sky) {
      textures.sky.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = textures.sky;
    }

    scene.add(new THREE.HemisphereLight(0x9aa8c2, 0x2a2a1c, 1.8));
    const moon = new THREE.DirectionalLight(0xbfd0ff, 1.6);
    moon.position.set(-20, 30, 10);
    scene.add(moon);

    const groundMat = new THREE.MeshLambertMaterial({ map: textures.ground ?? makeGroundTexture() });
    const groundGeo = new THREE.PlaneGeometry(120, world.tileLength);
    groundGeo.rotateX(-Math.PI / 2);

    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    const crownGeo = new THREE.ConeGeometry(1.4, 4, 7);
    crownGeo.translate(0, 4, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x1f2d1f });

    for (let i = 0; i < world.tileCount; i++) {
      const group = new THREE.Group();
      const ground = new THREE.Mesh(groundGeo, groundMat);
      group.add(ground);
      const trees: THREE.Group[] = [];
      for (let t = 0; t < world.treesPerTile; t++) {
        const tree = new THREE.Group();
        tree.add(new THREE.Mesh(trunkGeo, trunkMat), new THREE.Mesh(crownGeo, crownMat));
        group.add(tree);
        trees.push(tree);
      }
      const tile: Tile = { group, trees, startZ: 0 };
      this.placeTile(tile);
      this.tiles.push(tile);
      this.group.add(group);
    }
    scene.add(this.group);
  }

  /** Moves a tile to the front of the ring and re-scatters its scenery. */
  private placeTile(tile: Tile): void {
    const len = CONFIG.world.tileLength;
    tile.startZ = this.nextStartZ;
    this.nextStartZ -= len;
    // Tile spans [startZ - len, startZ]; its group origin sits at the centre.
    tile.group.position.set(0, 0, tile.startZ - len / 2);
    const laneEdge = CONFIG.player.laneHalfWidth + 2;
    for (const tree of tile.trees) {
      const side = this.rand() < 0.5 ? -1 : 1;
      tree.position.set(side * (laneEdge + this.rand() * 40), 0, (this.rand() - 0.5) * len);
      const s = 0.7 + this.rand() * 0.8;
      tree.scale.set(s, s * (0.8 + this.rand() * 0.5), s);
      tree.rotation.y = this.rand() * Math.PI * 2;
    }
  }

  update(playerZ: number): void {
    const len = CONFIG.world.tileLength;
    for (const tile of this.tiles) {
      // Tile is fully behind the player (with margin): recycle it ahead.
      if (tile.startZ - len > playerZ + len) this.placeTile(tile);
    }
  }

  reset(): void {
    this.nextStartZ = CONFIG.world.tileLength;
    for (const tile of this.tiles) this.placeTile(tile);
  }
}
