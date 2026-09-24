import * as THREE from 'three';

/**
 * Slots for generated art (e.g. Higgsfield). Every slot is optional: when `url` is
 * undefined, or the file fails to load, the game falls back to procedural placeholders.
 *
 * Drop files under `public/assets/<kind>/` and point the slot at them, e.g.
 * `ground: { url: '/assets/textures/ground.jpg', repeat: 8 }`.
 */
export interface TextureSlot {
  url?: string;
  /** How many times the texture tiles across one world tile. */
  repeat?: number;
}

export const ASSETS = {
  textures: {
    ground: {} as TextureSlot,
    zombieSkin: {} as TextureSlot,
    /** Equirectangular sky panorama. */
    sky: {} as TextureSlot,
  },
} as const;

export type TextureKey = keyof typeof ASSETS.textures;
export type LoadedTextures = Partial<Record<TextureKey, THREE.Texture>>;

const loader = new THREE.TextureLoader();

async function loadSlot(slot: TextureSlot): Promise<THREE.Texture | undefined> {
  if (!slot.url) return undefined;
  try {
    const tex = await loader.loadAsync(slot.url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (slot.repeat) tex.repeat.set(slot.repeat, slot.repeat);
    return tex;
  } catch (err) {
    console.warn(`[assets] failed to load ${slot.url}, using placeholder`, err);
    return undefined;
  }
}

export async function loadTextures(): Promise<LoadedTextures> {
  const entries = Object.entries(ASSETS.textures) as [TextureKey, TextureSlot][];
  const loaded = await Promise.all(entries.map(async ([key, slot]) => [key, await loadSlot(slot)] as const));
  const out: LoadedTextures = {};
  for (const [key, tex] of loaded) if (tex) out[key] = tex;
  return out;
}
