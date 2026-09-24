import * as THREE from 'three';
import { flameTexture, starTexture } from './vfxTextures';

/** How long one flash burns, in seconds. Real flashes last a frame or two. */
const DURATION = 0.07;
const VARIANTS = 4;

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
