import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedZombie } from '../assets/manifest';
import { clamp, type HitPart } from './logic';

/** What a zombie looks like. The Zombie class owns movement, health and the fall. */
export interface ZombieBody {
  readonly object: THREE.Object3D;
  /** Meshes the gun raycasts against; each carries `userData.part`. */
  readonly hitMeshes: THREE.Mesh[];
  animate(dt: number, speed: number, lunging: boolean, flinch: number): void;
  animateDeath(dt: number): void;
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

  constructor(owner: unknown) {
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
    this.legL.add(part(k.limb, k.pants, 'body'));
    this.legR.add(part(k.limb, k.pants, 'body'));
    // Classic zombie pose: arms reaching forward (+Z faces the player).
    this.armL.position.set(-0.33, 1.52, 0);
    this.armR.position.set(0.33, 1.52, 0);
    this.armL.add(part(k.limb, skin, 'body'));
    this.armR.add(part(k.limb, skin, 'body'));

    this.body.add(torso, this.head, this.armL, this.armR);
    this.object.add(this.body, this.legL, this.legR);
    this.object.scale.setScalar(0.9 + Math.random() * 0.25);
  }

  animate(dt: number, speed: number, lunging: boolean, flinch: number): void {
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
    body.scale.set(height * 0.3, height * 0.8, height * 0.2);
    body.position.y = height * 0.42;
    this.object.add(this.headProxy, body);
    this.hitMeshes.push(this.headProxy, body);
    this.object.scale.setScalar(0.94 + Math.random() * 0.12);
  }

  private findBone(pattern: RegExp): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    this.model.traverse((o) => {
      if (!found && (o as THREE.Bone).isBone && pattern.test(o.name) && !/end|top/i.test(o.name)) found = o;
    });
    return found;
  }

  animate(dt: number, speed: number, lunging: boolean, flinch: number): void {
    this.action.timeScale = clamp(speed / this.clipSpeed, 0.5, 2.6);
    this.mixer.update(dt);
    // Lean into the lunge, rock back when shot.
    this.model.rotation.x = (lunging ? 0.25 : 0) - flinch * 1.2;
    if (this.headBone) {
      this.object.updateWorldMatrix(true, true);
      this.headProxy.position.copy(this.object.worldToLocal(this.headBone.getWorldPosition(tmp)));
    }
  }

  animateDeath(dt: number): void {
    // Freeze the walk quickly; the Zombie class tips the whole body over.
    this.action.timeScale = Math.max(0, this.action.timeScale - dt * 6);
    this.mixer.update(dt);
    this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, 0, clamp(dt * 8, 0, 1));
  }
}
