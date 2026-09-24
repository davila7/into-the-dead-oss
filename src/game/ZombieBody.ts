import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedModel, LoadedZombie } from '../assets/manifest';
import { CONFIG } from './config';
import { clamp, type HitPart } from './logic';

/** What a zombie looks like. The Zombie class owns movement, health and the fall. */
export interface ZombieBody {
  readonly object: THREE.Object3D;
  /** Meshes the gun raycasts against; each carries `userData.part`. */
  readonly hitMeshes: THREE.Mesh[];
  /** `crawling`: a leg is gone and the Zombie class has laid the body face down. */
  animate(dt: number, speed: number, lunging: boolean, flinch: number, crawling?: boolean): void;
  animateDeath(dt: number): void;
  /** Takes off the leg on the side of `localX` (object space, +X is the body's left). */
  dismember?(localX: number): void;
}

function tagHit(mesh: THREE.Mesh, part: HitPart, owner: unknown): THREE.Mesh {
  mesh.userData.part = part;
  mesh.userData.zombie = owner;
  return mesh;
}

// ---------------------------------------------------------------------------
// Procedural placeholder built from boxes (used when no generated model loads).

interface Kit {
  head: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  limb: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  skins: THREE.MeshLambertMaterial[];
  clothes: THREE.MeshLambertMaterial[];
  pants: THREE.MeshLambertMaterial;
  eyes: THREE.MeshBasicMaterial;
}

let kit: Kit | undefined;

function getKit(): Kit {
  if (!kit) {
    const limb = new THREE.BoxGeometry(0.16, 0.8, 0.16);
    limb.translate(0, -0.4, 0); // pivot at the top (hip / shoulder)
    kit = {
      head: new THREE.BoxGeometry(0.3, 0.32, 0.3),
      torso: new THREE.BoxGeometry(0.5, 0.65, 0.28),
      limb,
      eye: new THREE.BoxGeometry(0.06, 0.03, 0.02),
      skins: [0x6f8a5c, 0x7d8f6a, 0x8a8f5f].map((color) => new THREE.MeshLambertMaterial({ color })),
      clothes: [0x4a3b33, 0x2f3a4a, 0x5a2a2a, 0x3e3e3e].map((color) => new THREE.MeshLambertMaterial({ color })),
      pants: new THREE.MeshLambertMaterial({ color: 0x23262b }),
      eyes: new THREE.MeshBasicMaterial({ color: 0xd8ff6a, fog: false }),
    };
  }
  return kit;
}

export class PrimitiveBody implements ZombieBody {
  readonly object = new THREE.Group();
  readonly hitMeshes: THREE.Mesh[] = [];
  private readonly body = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly head: THREE.Mesh;
  private phase = Math.random() * Math.PI * 2;

  /** `size` scales the whole body; `girth` widens it on top (the brute). */
  constructor(owner: unknown, { size = 0.9 + Math.random() * 0.25, girth = 1 }: { size?: number; girth?: number } = {}) {
    const k = getKit();
    const skin = k.skins[Math.floor(Math.random() * k.skins.length)];
    const shirt = k.clothes[Math.floor(Math.random() * k.clothes.length)];
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, p: HitPart) => {
      const mesh = tagHit(new THREE.Mesh(geo, mat), p, owner);
      this.hitMeshes.push(mesh);
      return mesh;
    };

    const torso = part(k.torso, shirt, 'body');
    torso.position.y = 1.25;
    this.head = part(k.head, skin, 'head');
    this.head.position.y = 1.75;
    for (const ex of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(k.eye, k.eyes);
      eye.position.set(ex, 0.03, 0.155);
      this.head.add(eye);
    }
    this.legL.position.set(-0.13, 0.9, 0);
    this.legR.position.set(0.13, 0.9, 0);
    this.legL.add(part(k.limb, k.pants, 'legs'));
    this.legR.add(part(k.limb, k.pants, 'legs'));
    // Classic zombie pose: arms reaching forward (+Z faces the player).
    this.armL.position.set(-0.33, 1.52, 0);
    this.armR.position.set(0.33, 1.52, 0);
    this.armL.add(part(k.limb, skin, 'body'));
    this.armR.add(part(k.limb, skin, 'body'));

    torso.scale.set(girth, 1, girth * 1.3);
    this.armL.position.x *= girth;
    this.armR.position.x *= girth;
    this.legL.position.x *= girth;
    this.legR.position.x *= girth;
    this.body.add(torso, this.head, this.armL, this.armR);
    this.object.add(this.body, this.legL, this.legR);
    this.object.scale.setScalar(size);
  }

  dismember(localX: number): void {
    // legL sits at -X, legR at +X; leave a stump at the hip.
    (localX < 0 ? this.legL : this.legR).scale.y = CONFIG.crawl.stump;
  }

  animate(dt: number, speed: number, lunging: boolean, flinch: number, crawling = false): void {
    if (crawling) {
      this.crawl(dt, speed, flinch);
      return;
    }
    this.phase += dt * (2 + speed * 2.2);
    const swing = Math.sin(this.phase) * 0.55;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    const reach = lunging ? -1.75 : -1.45;
    this.armL.rotation.x = reach + Math.sin(this.phase * 0.5) * 0.12;
    this.armR.rotation.x = reach + Math.cos(this.phase * 0.5) * 0.12;
    this.body.rotation.z = Math.sin(this.phase) * 0.06;
    this.head.rotation.z = Math.sin(this.phase * 0.5) * 0.2;
    this.body.rotation.x = -flinch * 1.6;
  }

  /** Face down, hauling itself along hand over hand, the leg that's left dragging behind. */
  private crawl(dt: number, speed: number, flinch: number): void {
    this.phase += dt * (2.5 + speed * 3);
    const pull = Math.sin(this.phase);
    // -PI points an arm along the body's +Y, which now runs along the ground ahead.
    this.armL.rotation.x = -2.75 + pull * 0.55;
    this.armR.rotation.x = -2.75 - pull * 0.55;
    this.legL.rotation.x = 0.1 + pull * 0.08;
    this.legR.rotation.x = 0.1 - pull * 0.08;
    this.body.rotation.z = pull * 0.1;
    this.body.rotation.x = -flinch * 0.8;
    // Head craned up to keep its eyes on the player.
    this.head.rotation.x = -1 + Math.sin(this.phase * 0.5) * 0.1;
    this.head.rotation.z = pull * 0.15;
  }

  animateDeath(dt: number): void {
    // Limbs go limp: arms flop overhead, legs straighten.
    const limp = clamp(dt * 8, 0, 1);
    const lerp = THREE.MathUtils.lerp;
    this.armL.rotation.x = lerp(this.armL.rotation.x, -2.9, limp);
    this.armR.rotation.x = lerp(this.armR.rotation.x, -2.6, limp);
    this.legL.rotation.x = lerp(this.legL.rotation.x, 0.1, limp);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -0.15, limp);
    this.body.rotation.x = lerp(this.body.rotation.x, 0, limp);
    this.head.rotation.x = lerp(this.head.rotation.x, 0.4, limp);
  }
}

// ---------------------------------------------------------------------------
// Generated (Higgsfield / Meshy) rigged model with an in-place walk clip.

const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
const headProxyGeo = new THREE.SphereGeometry(1, 8, 6);
const bodyProxyGeo = new THREE.BoxGeometry(1, 1, 1);
const tmp = new THREE.Vector3();

export class ModelBody implements ZombieBody {
  readonly object = new THREE.Group();
  readonly hitMeshes: THREE.Mesh[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly action: THREE.AnimationAction;
  private readonly clipSpeed: number;
  private readonly headBone?: THREE.Object3D;
  private readonly headProxy: THREE.Mesh;
  private readonly model: THREE.Object3D;
  /** Knee bones by side (Meshy rigs name them LeftLeg / RightLeg); a severed one is scaled to nothing. */
  private readonly knees: { left?: THREE.Object3D; right?: THREE.Object3D };
  private readonly severed: THREE.Object3D[] = [];

  constructor(owner: unknown, source: LoadedZombie) {
    const height = source.slot.height;
    this.clipSpeed = source.slot.clipSpeed;
    this.model = SkeletonUtils.clone(source.scene);
    this.object.add(this.model);
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        // Generated PBR materials look flat-black under moonlight with no env map.
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.isMeshStandardMaterial) {
          mat.metalness = 0;
          mat.roughness = Math.max(mat.roughness, 0.8);
        }
      }
    });
    this.headBone = this.findBone(/head/i);
    this.knees = { left: this.findBone(/^left_?leg$/i), right: this.findBone(/^right_?leg$/i) };

    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = source.animations[0];
    this.action = this.mixer.clipAction(clip);
    this.action.play();
    this.action.time = Math.random() * clip.duration; // desync the horde

    // Cheap invisible hit volumes instead of raycasting skinned triangles.
    this.headProxy = tagHit(new THREE.Mesh(headProxyGeo, proxyMaterial), 'head', owner);
    this.headProxy.scale.setScalar(height * 0.075);
    this.headProxy.position.y = height * 0.92;
    const body = tagHit(new THREE.Mesh(bodyProxyGeo, proxyMaterial), 'body', owner);
    const girth = source.slot.girth ?? 1;
    body.scale.set(height * 0.3 * girth, height * 0.37, height * 0.2 * girth);
    body.position.y = height * 0.635;
    const legs = tagHit(new THREE.Mesh(bodyProxyGeo, proxyMaterial), 'legs', owner);
    legs.scale.set(height * 0.26 * girth, height * 0.45, height * 0.18 * girth);
    legs.position.y = height * 0.225;
    this.object.add(this.headProxy, body, legs);
    this.hitMeshes.push(this.headProxy, body, legs);
    this.object.scale.setScalar(0.94 + Math.random() * 0.12);
    this.headProxy.scale.multiplyScalar(Math.sqrt(girth));
  }

  private findBone(pattern: RegExp): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    this.model.traverse((o) => {
      if (!found && (o as THREE.Bone).isBone && pattern.test(o.name) && !/end|top/i.test(o.name)) found = o;
    });
    return found;
  }

  dismember(localX: number): void {
    const knee = localX >= 0 ? this.knees.left : this.knees.right;
    if (knee && !this.severed.includes(knee)) this.severed.push(knee);
  }

  /** The clip keys bone transforms every frame, so re-apply the missing shins after it. */
  private sever(): void {
    for (const knee of this.severed) knee.scale.setScalar(1e-3);
  }

  animate(dt: number, speed: number, lunging: boolean, flinch: number, crawling = false): void {
    // Crawlers paw along slowly with the walk clip; the Zombie class has laid them down.
    this.action.timeScale = clamp(speed / this.clipSpeed, crawling ? 0.35 : 0.5, 2.6);
    this.mixer.update(dt);
    this.sever();
    // Lean into the lunge, rock back when shot.
    this.model.rotation.x = (lunging ? 0.25 : 0) - flinch * (crawling ? 0.5 : 1.2);
    if (this.headBone) {
      this.object.updateWorldMatrix(true, true);
      this.headProxy.position.copy(this.object.worldToLocal(this.headBone.getWorldPosition(tmp)));
    }
  }

  animateDeath(dt: number): void {
    // Freeze the walk quickly; the Zombie class tips the whole body over.
    this.action.timeScale = Math.max(0, this.action.timeScale - dt * 6);
    this.mixer.update(dt);
    this.sever();
    this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, 0, clamp(dt * 8, 0, 1));
  }
}

// ---------------------------------------------------------------------------
// Four-legged things (mutant, dogs): a static generated mesh driven by a procedural gallop.

const quadKit = {
  skin: new THREE.MeshLambertMaterial({ color: 0x6d6a60 }),
  fur: new THREE.MeshLambertMaterial({ color: 0x2b2520 }),
  eyes: new THREE.MeshBasicMaterial({ color: 0xd8ff6a, fog: false }),
};

/** Box stand-in for a four-legged thing, `length` long, facing +Z. */
function makeQuadPlaceholder(length: number, mutant: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = mutant ? quadKit.skin : quadKit.fur;
  const h = length * 0.55;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(length * 0.28, h * 0.35, length * 0.62), mat);
  torso.position.y = h * 0.72;
  const head = new THREE.Group();
  head.position.set(0, h * 0.82, length * 0.38);
  // The mutant's head is split down the middle into two halves.
  for (const side of mutant ? [-1, 1] : [0]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(length * (mutant ? 0.09 : 0.16), h * 0.25, length * 0.22), mat);
    half.position.x = side * length * 0.07;
    half.rotation.z = side * 0.45;
    head.add(half);
  }
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), quadKit.eyes);
  eye.position.set(0, h * 0.05, length * 0.115);
  head.add(eye);
  g.add(torso, head);
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(length * 0.06, h * 0.6, length * 0.06), mat);
    leg.position.set(x * length * 0.1, h * 0.3, z * length * 0.24);
    g.add(leg);
  }
  return g;
}

export class QuadBody implements ZombieBody {
  readonly object = new THREE.Group();
  readonly hitMeshes: THREE.Mesh[] = [];
  private readonly rig = new THREE.Group();
  private phase = Math.random() * Math.PI * 2;
  private readonly length: number;

  /** `length` in meters nose to tail; the model is expected to face +Z. */
  constructor(owner: unknown, length: number, model: LoadedModel | undefined, mutant: boolean) {
    this.length = length;
    const look = model ? model.scene.clone(true) : makeQuadPlaceholder(length, mutant);
    this.rig.add(look);
    this.object.add(this.rig);
    const size = new THREE.Box3().setFromObject(look).getSize(new THREE.Vector3());
    const h = Math.max(0.3, size.y);
    const body = tagHit(new THREE.Mesh(bodyProxyGeo, proxyMaterial), 'body', owner);
    body.scale.set(clamp(size.x * 0.8, 0.3, length * 0.4), h * 0.6, length * 0.7);
    body.position.set(0, h * 0.55, -length * 0.05);
    const head = tagHit(new THREE.Mesh(headProxyGeo, proxyMaterial), 'head', owner);
    head.scale.setScalar(Math.max(0.12, length * 0.1));
    head.position.set(0, h * 0.72, length * 0.4);
    this.rig.add(body, head);
    this.hitMeshes.push(body, head);
    this.object.scale.setScalar(0.92 + Math.random() * 0.16);
  }

  animate(dt: number, speed: number, lunging: boolean, flinch: number): void {
    // A bounding gallop: one stride per body length or so.
    this.phase += dt * (3 + (speed / this.length) * 2.2);
    const s = Math.sin(this.phase);
    this.rig.position.y = Math.abs(s) * this.length * 0.06;
    this.rig.rotation.x = s * 0.12 + (lunging ? 0.2 : 0) - flinch * 1.4;
    this.rig.rotation.z = Math.sin(this.phase * 0.5) * 0.05;
  }

  animateDeath(dt: number): void {
    const k = clamp(dt * 8, 0, 1);
    this.rig.position.y = THREE.MathUtils.lerp(this.rig.position.y, 0, k);
    this.rig.rotation.x = THREE.MathUtils.lerp(this.rig.rotation.x, 0, k);
  }
}
