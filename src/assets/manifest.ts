import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  url: string;
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

export const ASSETS = {
  textures: {
    ground: {} as TextureSlot,
    /** Equirectangular sky panorama. */
    sky: {} as TextureSlot,
  },
  /** Rigged GLBs with an in-place walk clip. */
  zombies: [] as ZombieSlot[],
  trees: [] as ModelSlot[],
  scarecrow: undefined as ModelSlot | undefined,
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

async function loadModel(slot: ModelSlot): Promise<LoadedModel | undefined> {
  try {
    const gltf = await gltfLoader.loadAsync(resolve(slot.url));
    const inner = gltf.scene;
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? slot.height / size.y : 1;
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
  const [textureList, zombies, trees, scarecrow] = await Promise.all([
    Promise.all(textureEntries.map(async ([key, slot]) => [key, await loadTexture(slot)] as const)),
    Promise.all(ASSETS.zombies.map(async (slot) => {
      const model = await loadModel(slot);
      return model && model.animations.length > 0 ? { ...model, slot } : undefined;
    })),
    Promise.all(ASSETS.trees.map(loadModel)),
    ASSETS.scarecrow ? loadModel(ASSETS.scarecrow) : Promise.resolve(undefined),
  ]);
  const textures: LoadedTextures = {};
  for (const [key, tex] of textureList) if (tex) textures[key] = tex;
  return {
    textures,
    zombies: zombies.filter((z): z is LoadedZombie => z !== undefined),
    trees: trees.filter((t): t is LoadedModel => t !== undefined),
    scarecrow,
  };
}
