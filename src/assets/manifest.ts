import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import generated from '../../art/higgsfield-assets.json';

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
}

/** Remote URLs for generated models, keyed by name (see art/higgsfield-assets.json). */
const remoteByName = new Map<string, string>(generated.models.map((m) => [m.name, m.url]));

function generatedSlot(name: string, height: number, yaw?: number): ModelSlot {
  return { url: `assets/models/${name}.glb`, remote: remoteByName.get(name), height, yaw };
}

function zombieSlot(name: string, height: number, clipSpeed: number): ZombieSlot {
  return { ...generatedSlot(name, height), id: name, clipSpeed };
}

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
  trees: [generatedSlot('tree-oak', 7), generatedSlot('tree-cottonwood', 11)] as ModelSlot[],
  scarecrow: generatedSlot('scarecrow', 2.6) as ModelSlot | undefined,
  /**
   * First-person hand + pistol. `height` here is the model's longest side in meters;
   * the source image shows the barrel pointing left (-X), so yaw it to face -Z.
   */
  weapon: generatedSlot('viewmodel-pistol', 0.3, -Math.PI / 2) as ModelSlot | undefined,
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
  weapon?: LoadedModel;
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

export async function loadAssets(): Promise<LoadedAssets> {
  const textureEntries = Object.entries(ASSETS.textures) as [TextureKey, TextureSlot][];
  const [textureList, zombies, trees, scarecrow, weapon] = await Promise.all([
    Promise.all(textureEntries.map(async ([key, slot]) => [key, await loadTexture(slot)] as const)),
    Promise.all(ASSETS.zombies.map(async (slot) => {
      const model = await loadModel(slot);
      return model && model.animations.length > 0 ? { ...model, slot } : undefined;
    })),
    Promise.all(ASSETS.trees.map((slot) => loadModel(slot))),
    ASSETS.scarecrow ? loadModel(ASSETS.scarecrow) : Promise.resolve(undefined),
    ASSETS.weapon ? loadModel(ASSETS.weapon, 'longest') : Promise.resolve(undefined),
  ]);
  const textures: LoadedTextures = {};
  for (const [key, tex] of textureList) if (tex) textures[key] = tex;
  return {
    textures,
    zombies: zombies.filter((z): z is LoadedZombie => z !== undefined),
    trees: trees.filter((t): t is LoadedModel => t !== undefined),
    scarecrow,
    weapon,
  };
}
