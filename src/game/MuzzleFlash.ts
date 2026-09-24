import * as THREE from 'three';

/** How long one flash burns, in seconds. Real flashes last a frame or two. */
const DURATION = 0.07;
const VARIANTS = 4;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Front view of the flash: a white-hot core with irregular orange petals. */
function starTexture(): THREE.CanvasTexture {
  const size = 128;
  const r = size / 2;
  const [c, ctx] = canvas(size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(r, r);

  const petals = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < petals; i++) {
    const len = r * (0.55 + Math.random() * 0.45);
    ctx.save();
    ctx.rotate((i / petals) * Math.PI * 2 + (Math.random() - 0.5) * 0.6);
    ctx.scale(1, 0.12 + Math.random() * 0.12);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, 'rgba(255,230,170,0.9)');
    g.addColorStop(0.35, 'rgba(255,150,50,0.55)');
    g.addColorStop(1, 'rgba(200,60,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(len * 0.35, 0, len, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.42);
  core.addColorStop(0, 'rgba(255,255,245,1)');
  core.addColorStop(0.3, 'rgba(255,220,140,0.85)');
  core.addColorStop(1, 'rgba(255,110,30,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  return texture(c);
}

/** Side view of the flame jet: bright at the barrel (bottom), tapering and flickering to the tip. */
function flameTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const [c, ctx] = canvas(w, h);
  ctx.globalCompositeOperation = 'lighter';
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const t = i / (blobs - 1);
    const y = h * (1 - t * 0.85);
    const x = w / 2 + (Math.random() - 0.5) * w * 0.25 * t;
    const rad = w * (0.42 - t * 0.28) * (0.8 + Math.random() * 0.4);
    const a = 0.75 * (1 - t) + 0.15;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,${Math.round(235 - t * 90)},${Math.round(170 - t * 140)},${a})`);
    g.addColorStop(1, 'rgba(180,50,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}

function additive(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Viewmodel muzzle flash, parented to the barrel tip (barrel along -Z): a camera-facing
 * star, two crossed flame jets along the barrel and a flickering light, all fading out
 * over a few frames with a fresh random shape per shot.
 */
export class MuzzleFlash extends THREE.Group {
  private readonly stars = Array.from({ length: VARIANTS }, starTexture);
  private readonly flames = Array.from({ length: VARIANTS }, flameTexture);
  private readonly star: THREE.Sprite;
  private readonly jet = new THREE.Group();
  private readonly jetMat: THREE.MeshBasicMaterial;
  private readonly light = new THREE.PointLight(0xffb060, 0, 10, 2);
  private life = 0;
  private size = 1;

  constructor() {
    super();
    this.star = new THREE.Sprite(
      new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.jetMat = additive(this.flames[0]);
    // Base at the muzzle, extending forward down -Z; one horizontal and one vertical plane.
    const geo = new THREE.PlaneGeometry(0.07, 0.2).translate(0, 0.1, 0).rotateX(-Math.PI / 2);
    const flat = new THREE.Mesh(geo, this.jetMat);
    const upright = new THREE.Mesh(geo, this.jetMat);
    upright.rotation.z = Math.PI / 2;
    this.jet.add(flat, upright);
    this.add(this.star, this.jet, this.light);
    this.visible = false;
  }

  /** Starts a new flash; `strength` scales it (shotgun > pistol > SMG). */
  fire(strength: number): void {
    this.life = DURATION * (0.8 + Math.random() * 0.4);
    this.size = (0.75 + strength * 0.35) * (0.85 + Math.random() * 0.3);
    const pick = Math.floor(Math.random() * VARIANTS);
    const mat = this.star.material;
    mat.map = this.stars[pick];
    mat.rotation = Math.random() * Math.PI * 2;
    mat.needsUpdate = true;
    this.jetMat.map = this.flames[(pick + 1 + Math.floor(Math.random() * (VARIANTS - 1))) % VARIANTS];
    this.jetMat.needsUpdate = true;
    this.jet.rotation.z = Math.random() * Math.PI;
    this.jet.scale.set(this.size, this.size, this.size * (0.8 + Math.random() * 0.6));
    this.light.color.setHSL(0.08 + Math.random() * 0.03, 1, 0.6);
    this.visible = true;
  }

  update(dt: number): void {
    if (this.life <= 0) return;
    this.life = Math.max(0, this.life - dt);
    // 1 -> 0, front-loaded: the flash peaks at once and dies fast.
    const k = (this.life / DURATION) ** 2;
    const grow = 1 + (1 - k) * 0.35;
    this.star.material.opacity = Math.min(1, k * 1.2);
    this.star.scale.setScalar(0.16 * this.size * grow);
    this.jetMat.opacity = Math.min(1, k * 1.1);
    this.light.intensity = 8 * this.size * k;
    if (this.life === 0) this.visible = false;
  }

  reset(): void {
    this.life = 0;
    this.light.intensity = 0;
    this.visible = false;
  }
}

/** Soft, lumpy grey puff for gun smoke. */
export function smokeTexture(): THREE.CanvasTexture {
  const size = 64;
  const r = size / 2;
  const [c, ctx] = canvas(size, size);
  for (let i = 0; i < 9; i++) {
    const x = r + (Math.random() - 0.5) * r * 0.8;
    const y = r + (Math.random() - 0.5) * r * 0.8;
    const rad = r * (0.35 + Math.random() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
