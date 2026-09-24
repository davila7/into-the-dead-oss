import * as THREE from 'three';
import type { LoadedAssets } from '../assets/manifest';
import { makePickupModel } from './Course';
import { PICKUP_WEAPONS, type WeaponId } from './weapons';

/** Turntable speed (radians per real second). */
const SPIN = 1.8;

/**
 * The found weapon turning on a lit turntable inside the offer panel. Has its own small
 * renderer so it draws above the slowed-down game regardless of the panel's backdrop.
 */
export class WeaponPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  private readonly spinner = new THREE.Group();
  private readonly models = new Map<WeaponId, { model: THREE.Object3D; radius: number; halfHeight: number }>();
  private framed?: { radius: number; halfHeight: number };
  private angle = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    assets: LoadedAssets,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    for (const id of PICKUP_WEAPONS) {
      const model = makePickupModel(assets, id);
      // Centre it on the turntable axis.
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.sub(centre);
      const size = box.getSize(new THREE.Vector3());
      // Turning about Y, the gun sweeps a circle of this radius; its height stays put.
      const radius = Math.max(Math.hypot(size.x, size.z) / 2, 0.05);
      this.models.set(id, { model, radius, halfHeight: size.y / 2 });
    }

    // Warm key light, cold moonlit rim, so the gun reads against the dark panel.
    const key = new THREE.DirectionalLight(0xffe2b0, 2.6);
    key.position.set(1.5, 2, 2.5);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 1.6);
    rim.position.set(-2, 1, -2);
    this.scene.add(new THREE.HemisphereLight(0xd8dcef, 0x201810, 1.6), key, rim, this.spinner);
  }

  show(weapon: WeaponId): void {
    const entry = this.models.get(weapon);
    this.spinner.clear();
    if (!entry) return;
    this.spinner.add(entry.model);
    this.angle = -0.6;
    this.framed = entry;
  }

  /** Backs the camera off just enough that the full sweep fits the panel sideways and the gun fits upright. */
  private frame(aspect: number): void {
    if (!this.framed) return;
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const { radius, halfHeight } = this.framed;
    // The near end swings towards the camera, so keep an extra half radius back.
    const dist = Math.max(radius / Math.tan(hHalf), (halfHeight + radius * 0.3) / Math.tan(vHalf)) + radius * 0.5;
    this.camera.position.set(0, dist * 0.22, dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = dist / 20;
    this.camera.far = dist * 4;
  }

  /** Spins by real (not slowed) time and redraws; call every frame while the offer is up. */
  render(realDt: number): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frame(w / h);
    this.camera.updateProjectionMatrix();
    this.angle += realDt * SPIN;
    this.spinner.rotation.set(Math.sin(this.angle * 0.7) * 0.12, this.angle, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
