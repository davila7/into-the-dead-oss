import * as THREE from 'three';
import { CONFIG } from './config';
import { mulberry32 } from './logic';

/**
 * One tuft = a few wheat stalks with heads, merged into a single geometry so the
 * whole field is drawn with one InstancedMesh per tile.
 */
function makeTuftGeometry(rand: () => number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const stem = new THREE.Color(0x4a4128);
  const tip = new THREE.Color(0x8c7a4c);
  const head = new THREE.Color(0xb39a5e);

  const pushQuadStrip = (
    pts: THREE.Vector3[],
    widths: number[],
    side: THREE.Vector3,
    colorAt: (t: number) => THREE.Color,
  ) => {
    const base = positions.length / 3;
    pts.forEach((p, i) => {
      const w = widths[i] / 2;
      const c = colorAt(i / (pts.length - 1));
      positions.push(p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };

  const stalks = 3;
  for (let s = 0; s < stalks; s++) {
    const angle = rand() * Math.PI * 2;
    const side = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const ox = (rand() - 0.5) * 0.25;
    const oz = (rand() - 0.5) * 0.25;
    const height = CONFIG.wheat.height * (0.8 + rand() * 0.35);
    const lean = new THREE.Vector2((rand() - 0.5) * 0.25, (rand() - 0.5) * 0.25);
    const segs = 4;
    const pts: THREE.Vector3[] = [];
    const widths: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector3(ox + lean.x * t * t, height * t, oz + lean.y * t * t));
      widths.push(0.028 * (1 - t * 0.5));
    }
    pushQuadStrip(pts, widths, side, (t) => stem.clone().lerp(tip, t));

    // Grain head: two crossed tapered quads on top of the stalk.
    const top = pts[pts.length - 1];
    const headLen = 0.12 + rand() * 0.06;
    const headPts = [0, 0.5, 1].map((t) => new THREE.Vector3(top.x + lean.x * 0.15 * t, top.y + headLen * t, top.z + lean.y * 0.15 * t));
    const headWidths = [0.03, 0.055, 0.012];
    pushQuadStrip(headPts, headWidths, side, () => head);
    pushQuadStrip(headPts, headWidths, new THREE.Vector3(-side.z, 0, side.x), () => head);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Shared uniforms so every tile sways with the same wind. */
export const windUniforms = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector2() },
  uWindDir: { value: new THREE.Vector2(0.8, -0.6).normalize() },
  uHeight: { value: CONFIG.wheat.height },
};

/**
 * Bends vertices in world space: gusty wind that rolls across the field plus stalks
 * parting around the player. Height-weighted so roots stay planted.
 */
function applyWind(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec2 uPlayer;
uniform vec2 uWindDir;
uniform float uHeight;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vec2 rootXZ = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz;
#else
  vec2 rootXZ = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz;
#endif
vec4 worldPos = modelMatrix * mvPosition;
float h = clamp( position.y / uHeight, 0.0, 1.3 );
float bend = h * h;
// Gust fronts travel along the wind direction.
float front = dot( rootXZ, uWindDir ) * 0.09 - uTime * 1.1;
float gust = pow( sin( front ) * 0.5 + 0.5, 3.0 );
vec2 sway = uWindDir * ( 0.08 + gust * 0.42 + sin( uTime * 1.9 + dot( rootXZ, vec2( 0.73, 0.41 ) ) ) * 0.06 );
sway += vec2( sin( uTime * 3.3 + rootXZ.y * 2.1 ), cos( uTime * 2.9 + rootXZ.x * 1.7 ) ) * 0.035;
// Stalks part around the runner.
vec2 away = rootXZ - uPlayer;
float d = length( away );
sway += ( away / max( d, 0.001 ) ) * smoothstep( 1.8, 0.2, d ) * 0.7;
worldPos.xz += sway * bend;
worldPos.y -= dot( sway, sway ) * bend * 0.35;
mvPosition = viewMatrix * worldPos;
gl_Position = projectionMatrix * mvPosition;`,
      );
  };
}

interface Tile {
  mesh: THREE.InstancedMesh;
  /** z of the tile's forward edge (the tile spans [startZ - len, startZ]). */
  startZ: number;
}

/** Endless wheat: a ring of instanced tiles recycled ahead of the player. */
export class WheatField {
  private readonly tiles: Tile[] = [];
  private readonly rand = mulberry32(99);
  private nextStartZ: number = CONFIG.wheat.tileLength;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();

  constructor(scene: THREE.Scene, density: number) {
    const cfg = CONFIG.wheat;
    const geo = makeTuftGeometry(mulberry32(5));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    applyWind(mat);
    const count = Math.round(cfg.tuftsPerTile * density);
    for (let i = 0; i < cfg.tileCount; i++) {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false; // instances span the whole tile and bend in the shader
      const tile = { mesh, startZ: 0 };
      this.place(tile);
      this.tiles.push(tile);
      scene.add(mesh);
    }
  }

  private place(tile: Tile): void {
    const { tileLength, halfWidth } = CONFIG.wheat;
    tile.startZ = this.nextStartZ;
    this.nextStartZ -= tileLength;
    tile.mesh.position.set(0, 0, tile.startZ - tileLength / 2);
    const r = this.rand;
    for (let i = 0; i < tile.mesh.count; i++) {
      // Bias density towards the lane so the runner is always wading through it.
      const u = r() * 2 - 1;
      const x = Math.sign(u) * Math.pow(Math.abs(u), 1.25) * halfWidth;
      this.dummy.position.set(x, 0, (r() - 0.5) * tileLength);
      this.dummy.rotation.set(0, r() * Math.PI * 2, 0);
      const s = 0.8 + r() * 0.45;
      this.dummy.scale.set(s, s * (0.85 + r() * 0.3), s);
      this.dummy.updateMatrix();
      tile.mesh.setMatrixAt(i, this.dummy.matrix);
      // Patchy colour: some dry and pale, some darker and damp.
      this.tint.setHSL(0.11 + r() * 0.03, 0.35 + r() * 0.2, 0.42 + r() * 0.25);
      tile.mesh.setColorAt(i, this.tint);
    }
    tile.mesh.instanceMatrix.needsUpdate = true;
    if (tile.mesh.instanceColor) tile.mesh.instanceColor.needsUpdate = true;
  }

  update(time: number, player: THREE.Vector3): void {
    windUniforms.uTime.value = time;
    windUniforms.uPlayer.value.set(player.x, player.z);
    const len = CONFIG.wheat.tileLength;
    for (const tile of this.tiles) {
      // Recycle as soon as the whole tile is behind the camera.
      if (tile.startZ - len > player.z + 2) this.place(tile);
    }
  }

  reset(): void {
    this.nextStartZ = CONFIG.wheat.tileLength;
    for (const tile of this.tiles) this.place(tile);
  }
}
