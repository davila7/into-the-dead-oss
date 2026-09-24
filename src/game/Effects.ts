import * as THREE from 'three';
import { dropletTexture, smokeTexture, splatTexture } from './vfxTextures';

interface Droplet {
  sprite: THREE.Sprite;
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

interface Stain {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  life: number;
}

const GRAVITY = -9.8;
const TRACER_LIFE = 0.04;
const BLOOD_COLORS = [0x8a0e0c, 0x6a0808, 0xa01814];
/** How long a stain stays on the ground, and the final stretch over which it fades. */
const STAIN_LIFE = 9;
const STAIN_FADE = 2.5;

/** Pooled blood (droplets, mist and ground stains), gun smoke and bullet tracers. */
export class Effects {
  private readonly droplets: Droplet[] = [];
  private next = 0;
  private readonly mists: Puff[] = [];
  private nextMist = 0;
  private readonly stains: Stain[] = [];
  private nextStain = 0;
  private readonly puffs: Puff[] = [];
  private nextPuff = 0;
  private readonly tracer: THREE.Line;
  private tracerLife = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly shotDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, poolSize = 220) {
    const drop = dropletTexture();
    const dropMats = BLOOD_COLORS.map((color) => new THREE.SpriteMaterial({ map: drop, color, transparent: true }));
    for (let i = 0; i < poolSize; i++) {
      const sprite = new THREE.Sprite(dropMats[i % dropMats.length]);
      sprite.visible = false;
      scene.add(sprite);
      this.droplets.push({ sprite, vel: new THREE.Vector3(), life: 0 });
    }

    const mist = smokeTexture();
    for (let i = 0; i < 16; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: mist, color: 0x9a1210, transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      scene.add(sprite);
      this.mists.push({ sprite, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0 });
    }

    const splats = [splatTexture(), splatTexture(), splatTexture()];
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(
        flat,
        new THREE.MeshLambertMaterial({
          map: splats[i % splats.length],
          color: BLOOD_COLORS[i % BLOOD_COLORS.length],
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.stains.push({ mesh, life: 0 });
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
        new THREE.SpriteMaterial({ map: smoke, color: 0x807c75, transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({ sprite, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0 });
    }
  }

  /** A bullet striking flesh at `point`, travelling along `away`; `amount` grows with a kill. */
  blood(point: THREE.Vector3, away: THREE.Vector3, amount: number): void {
    // A puff of red mist that hangs for a moment at the wound.
    const mists = amount > 15 ? 2 : 1;
    for (let i = 0; i < mists; i++) {
      const m = this.mists[this.nextMist];
      this.nextMist = (this.nextMist + 1) % this.mists.length;
      m.sprite.visible = true;
      m.sprite.position.copy(point);
      m.sprite.material.rotation = Math.random() * Math.PI * 2;
      m.vel.copy(away).multiplyScalar(0.6 + Math.random() * 0.8);
      m.maxLife = m.life = 0.3 + Math.random() * 0.2;
      m.size = 0.6 + Math.random() * 0.4 + (amount > 15 ? 0.35 : 0);
    }

    // Most of the spray exits along the shot; the rest spatters back and out to the sides.
    const count = Math.round(amount * 1.6);
    for (let i = 0; i < count; i++) {
      const p = this.droplets[this.next];
      this.next = (this.next + 1) % this.droplets.length;
      p.sprite.visible = true;
      p.sprite.position.copy(point);
      p.sprite.scale.setScalar(0.03 + Math.random() ** 2 * 0.07);
      const exit = Math.random() < 0.65;
      p.vel
        .copy(away)
        .multiplyScalar(exit ? 2 + Math.random() * 3.5 : -(0.4 + Math.random() * 1.2))
        .add(this.tmp.set((Math.random() - 0.5) * 2.4, 0.4 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4));
      p.life = 1.5;
    }
  }

  private stain(x: number, z: number, size: number): void {
    const s = this.stains[this.nextStain];
    this.nextStain = (this.nextStain + 1) % this.stains.length;
    s.mesh.visible = true;
    s.mesh.position.set(x, 0.015, z);
    s.mesh.rotation.y = Math.random() * Math.PI * 2;
    s.mesh.scale.set(size * (0.8 + Math.random() * 0.4), 1, size);
    s.mesh.material.opacity = 0.9;
    s.life = STAIN_LIFE;
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
    for (const p of this.droplets) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      p.vel.y += GRAVITY * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      if (p.sprite.position.y < 0.02) {
        // Landed: the bigger drops leave a mark on the ground.
        p.sprite.visible = false;
        if (Math.random() < 0.35) this.stain(p.sprite.position.x, p.sprite.position.z, 0.12 + p.sprite.scale.x * 4);
      } else if (p.life <= 0) {
        p.sprite.visible = false;
      }
    }
    for (const m of this.mists) {
      if (!m.sprite.visible) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.sprite.visible = false;
        continue;
      }
      const t = 1 - m.life / m.maxLife;
      m.sprite.position.addScaledVector(m.vel, dt);
      m.sprite.scale.setScalar(m.size * (0.35 + 0.65 * Math.sqrt(t)));
      m.sprite.material.opacity = (1 - t) ** 1.5;
    }
    for (const s of this.stains) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life <= 0) s.mesh.visible = false;
      else if (s.life < STAIN_FADE) s.mesh.material.opacity = 0.9 * (s.life / STAIN_FADE);
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
      p.sprite.material.opacity = 0.35 * Math.min(1, t * 8) * (1 - t);
    }
    this.tracerLife = Math.max(0, this.tracerLife - dt);
    (this.tracer.material as THREE.LineBasicMaterial).opacity = 0.35 * (this.tracerLife / TRACER_LIFE);
  }

  reset(): void {
    for (const p of this.droplets) p.sprite.visible = false;
    for (const m of this.mists) m.sprite.visible = false;
    for (const s of this.stains) s.mesh.visible = false;
    for (const p of this.puffs) p.sprite.visible = false;
    this.tracerLife = 0;
  }
}
