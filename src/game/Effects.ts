import * as THREE from 'three';
import { smokeTexture } from './MuzzleFlash';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

const GRAVITY = -9.8;
const TRACER_LIFE = 0.04;

/** Pooled blood splatter, gun smoke and bullet tracers. */
export class Effects {
  private readonly particles: Particle[] = [];
  private next = 0;
  private readonly puffs: Puff[] = [];
  private nextPuff = 0;
  private readonly tracer: THREE.Line;
  private tracerLife = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly shotDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, poolSize = 160) {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0x6b0a0a });
    for (let i = 0; i < poolSize; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0 });
    }

    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(
      tracerGeo,
      new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, fog: false }),
    );
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);

    const smoke = smokeTexture();
    for (let i = 0; i < 32; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: smoke, color: 0xbdb8ae, transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({ sprite, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0 });
    }
  }

  blood(point: THREE.Vector3, away: THREE.Vector3, amount: number): void {
    for (let i = 0; i < amount; i++) {
      const p = this.particles[this.next];
      this.next = (this.next + 1) % this.particles.length;
      p.mesh.visible = true;
      p.mesh.position.copy(point);
      p.mesh.scale.setScalar(0.6 + Math.random() * 1.2);
      p.vel
        .copy(away)
        .multiplyScalar(1 + Math.random() * 3)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3));
      p.life = 0.6 + Math.random() * 0.6;
    }
  }

  shot(from: THREE.Vector3, to: THREE.Vector3): void {
    const pos = this.tracer.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.tracerLife = TRACER_LIFE;
    this.smoke(from, this.shotDir.subVectors(to, from).normalize());
  }

  /** A few slow, expanding puffs blown out of the barrel along `dir`. */
  private smoke(at: THREE.Vector3, dir: THREE.Vector3): void {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const p = this.puffs[this.nextPuff];
      this.nextPuff = (this.nextPuff + 1) % this.puffs.length;
      p.sprite.visible = true;
      p.sprite.position.copy(at).addScaledVector(dir, 0.05 + i * 0.08);
      p.sprite.material.rotation = Math.random() * Math.PI * 2;
      p.vel
        .copy(dir)
        .multiplyScalar(0.6 + Math.random() * 1.2)
        .add(this.tmp.set((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3));
      p.maxLife = p.life = 0.7 + Math.random() * 0.6;
      p.size = 0.25 + Math.random() * 0.25;
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      p.vel.y += GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) {
        // Settle on the ground as a small stain.
        p.mesh.position.y = 0.02;
        p.vel.set(0, 0, 0);
      }
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(0.05 + p.size * Math.sqrt(t));
      p.sprite.material.opacity = 0.45 * Math.min(1, t * 8) * (1 - t);
    }
    this.tracerLife = Math.max(0, this.tracerLife - dt);
    (this.tracer.material as THREE.LineBasicMaterial).opacity = 0.35 * (this.tracerLife / TRACER_LIFE);
  }

  reset(): void {
    for (const p of this.particles) p.mesh.visible = false;
    for (const p of this.puffs) p.sprite.visible = false;
    this.tracerLife = 0;
  }
}
