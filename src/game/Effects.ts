import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const GRAVITY = -9.8;

/** Pooled blood splatter and bullet tracers. */
export class Effects {
  private readonly particles: Particle[] = [];
  private next = 0;
  private readonly tracer: THREE.Line;
  private tracerLife = 0;

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
    this.tracerLife = 0.05;
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
    this.tracerLife = Math.max(0, this.tracerLife - dt);
    (this.tracer.material as THREE.LineBasicMaterial).opacity = this.tracerLife > 0 ? 0.8 : 0;
  }

  reset(): void {
    for (const p of this.particles) p.mesh.visible = false;
    this.tracerLife = 0;
  }
}
