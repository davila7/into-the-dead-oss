import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import generated from '../../art/higgsfield-assets.json';
import type { WeaponId } from '../game/weapons';

/**
 * Slots for generated art (Higgsfield). Every slot is optional: when it is empty, or
 * the file fails to load, the game falls back to procedural placeholders.
 *
 * Paths are relative to the site root (`public/`), e.g. `assets/models/zombie-farmer.glb`.
 */
export interface TextureSlot {
  url?: string;
  /** How many times the texture tiles across one world tile. */
  repeat?: number;
}

export interface ModelSlot {
  /** Local file under public/ (fetched by `npm run assets:fetch`). */
  url: string;
  /** Fallback source (the Higgsfield CDN) used while the local file isn't there. */
  remote?: string;
  /** Height in meters the model is scaled to. */
  height: number;
  /** Extra yaw (radians) if the model doesn't face +Z. */
  yaw?: number;
}

export interface ZombieSlot extends ModelSlot {
  id: string;
  /** Ground speed (m/s) the walk clip was authored for; drives playback rate. */
  clipSpeed: number;
  /** Width of the hit volume relative to a normal zombie (the brute is wider). */
  girth?: number;
}

/** Remote URLs for generated models, keyed by name (see art/higgsfield-assets.json). */
const remoteByName = new Map<string, string>(generated.models.map((m) => [m.name, m.url]));

function generatedSlot(name: string, height: number, yaw?: number): ModelSlot {
  return { url: `assets/models/${name}.glb`, remote: remoteByName.get(name), height, yaw };
}

function zombieSlot(name: string, height: number, clipSpeed: number, girth?: number): ZombieSlot {
  return { ...generatedSlot(name, height), id: name, clipSpeed, girth };
}

/** Yaw that turns the generated quadrupeds (modelled side-on) to face +Z. */
const QUAD_YAW = { mutant: 0, dog: 0 };

export const ASSETS = {
  textures: {
    ground: {} as TextureSlot,
    /** Equirectangular sky panorama. */
    sky: {} as TextureSlot,
  },
  /** Rigged GLBs with an in-place walk clip. */
  zombies: [
    zombieSlot('zombie-farmer', 1.75, 0.9),
    zombieSlot('zombie-farmwife', 1.65, 0.9),
    zombieSlot('zombie-trucker', 1.85, 0.8),
    zombieSlot('zombie-deputy', 1.8, 0.9),
    zombieSlot('zombie-hunter', 1.8, 0.9),
  ] as ZombieSlot[],
  trees: [generatedSlot('tree-oak', 7), generatedSlot('tree-cottonwood', 8)] as ModelSlot[],
  scarecrow: generatedSlot('scarecrow', 2.6) as ModelSlot | undefined,
  /**
   * First-person hand + weapon. `height` here is the model's longest side in meters;
   * the generated meshes have the barrel along -X (checked in a render), so yaw them to face -Z.
   */
  weapons: {
    pistol: generatedSlot('viewmodel-pistol', 0.34, -Math.PI / 2),
    shotgun: generatedSlot('viewmodel-shotgun', 0.72, -Math.PI / 2),
    rifle: generatedSlot('viewmodel-rifle', 0.8, -Math.PI / 2),
    smg: generatedSlot('viewmodel-smg', 0.42, -Math.PI / 2),
  } as Partial<Record<WeaponId, ModelSlot>>,
  /** Weapons lying in the field (longest side in meters). */
  pickups: {
    shotgun: generatedSlot('pickup-shotgun', 1.0),
    rifle: generatedSlot('pickup-rifle', 1.05),
    smg: generatedSlot('pickup-smg', 0.6),
  } as Partial<Record<WeaponId, ModelSlot>>,
  /** One section of broken fence, rails along X. */
  fence: generatedSlot('fence-broken', 1.35) as ModelSlot | undefined,
  /** Later levels (see CONFIG.horrors). Quadrupeds: `height` is nose-to-tail length, facing +Z. */
  horrors: {
    brute: zombieSlot('zombie-brute', 2.35, 0.8, 1.7) as ZombieSlot | undefined,
    mutant: generatedSlot('zombie-mutant', 2.4, QUAD_YAW.mutant) as ModelSlot | undefined,
    dog: generatedSlot('zombie-dog', 1.15, QUAD_YAW.dog) as ModelSlot | undefined,
    /** Hooded body, hung by the neck from a rope added in code. */
    hanged: generatedSlot('zombie-hanged', 1.75) as ModelSlot | undefined,
    /** Arms spread in a T; the cross is built in code. */
    crucified: generatedSlot('zombie-crucified', 1.75) as ModelSlot | undefined,
  },
};

export type TextureKey = keyof typeof ASSETS.textures;
export type LoadedTextures = Partial<Record<TextureKey, THREE.Texture>>;

export interface LoadedModel {
  /** Normalised template: feet at y=0, centred on X/Z, scaled to the slot height. */
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface LoadedZombie extends LoadedModel {
  slot: ZombieSlot;
}

export interface LoadedAssets {
  textures: LoadedTextures;
  zombies: LoadedZombie[];
  trees: LoadedModel[];
  scarecrow?: LoadedModel;
  weapons: Partial<Record<WeaponId, LoadedModel>>;
  pickups: Partial<Record<WeaponId, LoadedModel>>;
  fence?: LoadedModel;
  horrors: {
    brute?: LoadedZombie;
    mutant?: LoadedModel;
    dog?: LoadedModel;
    hanged?: LoadedModel;
    crucified?: LoadedModel;
  };
}

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

function resolve(url: string): string {
  return /^(https?:)?\/\//.test(url) || url.startsWith('/') ? url : import.meta.env.BASE_URL + url;
}

async function loadTexture(slot: TextureSlot): Promise<THREE.Texture | undefined> {
  if (!slot.url) return undefined;
  try {
    const tex = await textureLoader.loadAsync(resolve(slot.url));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (slot.repeat) tex.repeat.set(slot.repeat, slot.repeat);
    return tex;
  } catch (err) {
    console.warn(`[assets] failed to load ${slot.url}, using placeholder`, err);
    return undefined;
  }
}

async function loadGltf(slot: ModelSlot) {
  const sources = [resolve(slot.url), slot.remote].filter((u): u is string => Boolean(u));
  let lastError: unknown;
  for (const src of sources) {
    try {
      return await gltfLoader.loadAsync(src);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function loadModel(slot: ModelSlot, fit: 'height' | 'longest' = 'height'): Promise<LoadedModel | undefined> {
  try {
    const gltf = await loadGltf(slot);
    const inner = gltf.scene;
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const measured = fit === 'height' ? size.y : Math.max(size.x, size.y, size.z);
    const scale = measured > 0 ? slot.height / measured : 1;
    const center = box.getCenter(new THREE.Vector3());
    inner.scale.multiplyScalar(scale);
    inner.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    const scene = new THREE.Group();
    scene.rotation.y = slot.yaw ?? 0;
    scene.add(inner);
    inner.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        // Skinned meshes animate outside their bind-pose bounds.
        o.frustumCulled = false;
      }
    });
    return { scene, animations: gltf.animations };
  } catch (err) {
    console.warn(`[assets] failed to load ${slot.url}, using placeholder`, err);
    return undefined;
  }
}

async function loadModelMap(
  slots: Partial<Record<WeaponId, ModelSlot>>,
): Promise<Partial<Record<WeaponId, LoadedModel>>> {
  const entries = await Promise.all(
    (Object.entries(slots) as [WeaponId, ModelSlot][]).map(async ([id, slot]) => [id, await loadModel(slot, 'longest')] as const),
  );
  const out: Partial<Record<WeaponId, LoadedModel>> = {};
  for (const [id, model] of entries) if (model) out[id] = model;
  return out;
}

async function loadZombie(slot: ZombieSlot): Promise<LoadedZombie | undefined> {
  const model = await loadModel(slot);
  return model && model.animations.length > 0 ? { ...model, slot } : undefined;
}

const optional = (slot: ModelSlot | undefined, fit: 'height' | 'longest' = 'height') =>
  slot ? loadModel(slot, fit) : Promise.resolve(undefined);

export async function loadAssets(): Promise<LoadedAssets> {
  const textureEntries = Object.entries(ASSETS.textures) as [TextureKey, TextureSlot][];
  const h = ASSETS.horrors;
  const [textureList, zombies, trees, scarecrow, weapons, pickups, fence, brute, mutant, dog, hanged, crucified] = await Promise.all([
    Promise.all(textureEntries.map(async ([key, slot]) => [key, await loadTexture(slot)] as const)),
    Promise.all(ASSETS.zombies.map(loadZombie)),
    Promise.all(ASSETS.trees.map((slot) => loadModel(slot))),
    ASSETS.scarecrow ? loadModel(ASSETS.scarecrow) : Promise.resolve(undefined),
    loadModelMap(ASSETS.weapons),
    loadModelMap(ASSETS.pickups),
    optional(ASSETS.fence),
    h.brute ? loadZombie(h.brute) : Promise.resolve(undefined),
    optional(h.mutant, 'longest'),
    optional(h.dog, 'longest'),
    optional(h.hanged),
    optional(h.crucified),
  ]);
  const textures: LoadedTextures = {};
  for (const [key, tex] of textureList) if (tex) textures[key] = tex;
  return {
    textures,
    zombies: zombies.filter((z): z is LoadedZombie => z !== undefined),
    trees: trees.filter((t): t is LoadedModel => t !== undefined),
    scarecrow,
    weapons,
    pickups,
    fence,
    horrors: { brute, mutant, dog, hanged, crucified },
  };
}
