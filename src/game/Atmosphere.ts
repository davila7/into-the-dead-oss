import * as THREE from 'three';
import { CONFIG } from './config';
import { mulberry32 } from './logic';

const SKY_RADIUS = 160;

function makePuffTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(3);
  // A soft blob built from overlapping radial gradients reads as a wisp of mist.
  for (let i = 0; i < 14; i++) {
    const x = size * (0.3 + rand() * 0.4);
    const y = size * (0.35 + rand() * 0.3);
    const r = size * (0.15 + rand() * 0.25);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(235,240,255,1)');
  g.addColorStop(0.24, 'rgba(200,215,255,0.35)');
  g.addColorStop(1, 'rgba(200,215,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Barn, grain silo, windmill and power poles: black cut-outs on the horizon. */
function makeFarmSilhouettes(): { group: THREE.Group; windmillRotor: THREE.Object3D; beacon: THREE.Mesh } {
  const mat = new THREE.MeshBasicMaterial({ color: CONFIG.atmosphere.silhouetteColor, fog: false });
  const group = new THREE.Group();

  const barn = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 10), mat);
  body.position.y = 3.5;
  // Gambrel roof, the classic Midwest barn profile.
  const profile = new THREE.Shape([
    new THREE.Vector2(-7.4, 0),
    new THREE.Vector2(-6, 3),
    new THREE.Vector2(0, 5.2),
    new THREE.Vector2(6, 3),
    new THREE.Vector2(7.4, 0),
  ]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(profile, { depth: 11, bevelEnabled: false }), mat);
  roof.position.set(0, 7, -5.5);
  barn.add(body, roof);
  barn.position.set(-38, 0, -125);
  barn.rotation.y = 0.4;

  const silo = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 18, 16), mat);
  tube.position.y = 9;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.y = 18;
  silo.add(tube, dome);
  silo.position.set(-26, 0, -130);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }),
  );
  beacon.position.set(-26, 21.3, -130);

  const windmill = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.6, 16, 4), mat);
  tower.position.y = 8;
  const rotor = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 0.05), mat);
    blade.position.y = 1.6;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 12) * Math.PI * 2;
    arm.add(blade);
    rotor.add(arm);
  }
  rotor.position.set(0, 16.2, 0.8);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 3.5), mat);
  tail.position.set(0, 16.2, -1.5);
  windmill.add(tower, rotor, tail);
  windmill.position.set(34, 0, -115);
  windmill.rotation.y = -0.5;

  group.add(barn, silo, windmill, beacon);

  // A line of leaning power poles running off towards the horizon.
  for (let i = 0; i < 9; i++) {
    const pole = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 5), mat);
    post.position.y = 4.5;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.15), mat);
    cross.position.y = 8.4;
    pole.add(post, cross);
    pole.position.set(55 - i * 3, 0, -60 - i * 12);
    pole.rotation.z = (i % 3 === 1 ? 1 : -1) * 0.04;
    group.add(pole);
  }

  return { group, windmillRotor: rotor, beacon };
}

/** Fog colour deep inside the corn. */
const CORN_FOG = new THREE.Color(0x121510);

/**
 * Night sky, moon, horizon silhouettes, rolling ground mist and chaff drifting on
 * the wind. Everything here follows the player so it never runs out.
 */
export class Atmosphere {
  private readonly sky: THREE.Mesh;
  private readonly followers = new THREE.Group();
  private readonly mist: THREE.Sprite[] = [];
  private readonly chaff: THREE.Points;
  private readonly chaffVel: Float32Array;
  private readonly windmillRotor: THREE.Object3D;
  private readonly beacon: THREE.Mesh;
  private readonly rand = mulberry32(21);

  constructor(scene: THREE.Scene, density: number) {
    const cfg = CONFIG.atmosphere;
    scene.background = new THREE.Color(cfg.horizonColor);
    scene.fog = new THREE.FogExp2(cfg.horizonColor, cfg.fogDensity);

    // Gradient dome; the horizon colour matches the fog so the field melts into it.
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color(cfg.horizonColor) },
          uZenith: { value: new THREE.Color(cfg.zenithColor) },
        },
        vertexShader: `varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: `uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vDir;
void main() {
  float t = smoothstep(-0.02, 0.45, vDir.y);
  gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
  #include <colorspace_fragment>
}`,
      }),
    );
    this.sky.renderOrder = -2;
    this.followers.add(this.sky);

    // Stars on the upper hemisphere.
    const starPos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const theta = this.rand() * Math.PI * 2;
      const y = 0.12 + this.rand() * 0.88;
      const r = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(theta) * r * 150, y * 150, Math.sin(theta) * r * 150);
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
      new THREE.PointsMaterial({ color: 0xc9d4ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }),
    );
    stars.renderOrder = -1;
    this.followers.add(stars);

    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeGlowTexture(), fog: false, depthWrite: false, color: 0xe8ecff }),
    );
    moon.position.copy(cfg.moonDirection).multiplyScalar(140);
    moon.scale.setScalar(26);
    moon.renderOrder = -1;
    this.followers.add(moon);

    const farm = makeFarmSilhouettes();
    this.followers.add(farm.group);
    this.windmillRotor = farm.windmillRotor;
    this.beacon = farm.beacon;

    scene.add(new THREE.HemisphereLight(0x6f7fa8, 0x1c1810, 1.4));
    const moonLight = new THREE.DirectionalLight(0xb9c8ff, 1.9);
    moonLight.position.copy(cfg.moonDirection).multiplyScalar(50);
    this.followers.add(moonLight, moonLight.target);

    // Low mist banks that drift across the field.
    const puffTex = makePuffTexture();
    const mistCount = Math.round(cfg.mistCount * density);
    for (let i = 0; i < mistCount; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: puffTex,
          color: cfg.mistColor,
          transparent: true,
          depthWrite: false,
          opacity: 0.1 + this.rand() * 0.14,
        }),
      );
      this.placeMist(sprite, 0, true);
      this.mist.push(sprite);
      scene.add(sprite);
    }

    // Chaff and seeds blowing through the air near the runner.
    const chaffCount = Math.round(cfg.chaffCount * density);
    const pos = new Float32Array(chaffCount * 3);
    this.chaffVel = new Float32Array(chaffCount * 3);
    for (let i = 0; i < chaffCount; i++) this.resetChaff(pos, i, new THREE.Vector3(), true);
    this.chaff = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: 0xcdb98a, size: 0.035, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.chaff.frustumCulled = false;
    scene.add(this.chaff);

    scene.add(this.followers);
  }

  private placeMist(sprite: THREE.Sprite, playerZ: number, anywhere: boolean): void {
    const r = this.rand;
    const ahead = anywhere ? -5 + r() * 90 : 70 + r() * 25;
    const s = 7 + r() * 9;
    // Wide and flat so the mist hugs the wheat instead of walling off the view.
    sprite.scale.set(s * 1.8, s * 0.22, 1);
    sprite.position.set((r() * 2 - 1) * 45, 0.5 + r() * 0.7, playerZ - ahead);
  }

  private resetChaff(pos: Float32Array, i: number, player: THREE.Vector3, anywhere: boolean): void {
    const r = this.rand;
    // Spawn upwind (the wind blows towards +X) so particles cross the view.
    pos[i * 3] = player.x + (anywhere ? (r() * 2 - 1) * 20 : -20 + r() * 8);
    pos[i * 3 + 1] = 0.3 + r() * 2.8;
    pos[i * 3 + 2] = player.z + 2 - r() * 45;
    this.chaffVel[i * 3] = 1.2 + r() * 1.5;
    this.chaffVel[i * 3 + 1] = (r() - 0.5) * 0.3;
    this.chaffVel[i * 3 + 2] = -0.4 - r() * 0.8;
  }

  update(dt: number, time: number, player: THREE.Vector3): void {
    this.followers.position.set(player.x, 0, player.z);
    this.windmillRotor.rotation.z -= dt * 1.4;
    (this.beacon.material as THREE.MeshBasicMaterial).color.setRGB(Math.sin(time * 2.5) > 0.6 ? 1 : 0.15, 0.06, 0.03);

    for (const m of this.mist) {
      m.position.x += dt * 0.9;
      if (m.position.x > player.x + 50) m.position.x -= 100;
      if (m.position.z > player.z + 6) this.placeMist(m, player.z, false);
    }

    const pos = this.chaff.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      const v = this.chaffVel;
      arr[i * 3] += (v[i * 3] + Math.sin(time * 2 + i) * 0.6) * dt;
      arr[i * 3 + 1] += (v[i * 3 + 1] + Math.cos(time * 1.7 + i * 0.3) * 0.25) * dt;
      arr[i * 3 + 2] += v[i * 3 + 2] * dt;
      const dx = arr[i * 3] - player.x;
      if (arr[i * 3 + 2] > player.z + 3 || Math.abs(dx) > 22 || arr[i * 3 + 1] < 0.05) {
        this.resetChaff(arr, i, player, false);
      }
    }
    pos.needsUpdate = true;
  }

  /** Thickens and darkens the fog while inside the corn (0 = open field, 1 = deep in). */
  setCover(scene: THREE.Scene, cover: number): void {
    const fog = scene.fog as THREE.FogExp2;
    const cfg = CONFIG.atmosphere;
    fog.density = cfg.fogDensity + (CONFIG.corn.fogDensity - cfg.fogDensity) * cover;
    fog.color.setHex(cfg.horizonColor).lerp(CORN_FOG, cover);
  }

  reset(player: THREE.Vector3): void {
    for (const m of this.mist) this.placeMist(m, player.z, true);
    const arr = (this.chaff.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) this.resetChaff(arr, i, player, true);
  }
}
