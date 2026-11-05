import { MeshStandardMaterial } from 'three';
import { PALETTE } from './Palette';
import { TextureFactory, type SurfaceId } from './TextureFactory';

export type SkinVariant = 'slasher' | 'leaper' | 'exploder';

const SKIN_TEXTURE: Record<SkinVariant, SurfaceId> = {
  slasher: 'necroSlasher',
  leaper: 'necroLeaper',
  exploder: 'necroExploder'
};

/** Wet-looking skin with relief. Textures are cached and shared; the material is per enemy so it can be tinted. */
export function skinMaterial(variant: SkinVariant): MeshStandardMaterial {
  const { map, normalMap, roughnessMap } = TextureFactory.surfaceMaps(SKIN_TEXTURE[variant], 1.5);
  const mat = new MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 0.65, metalness: 0.05 });
  // Per-enemy brightness variation so a group of them does not look cloned.
  mat.color.setScalar(0.85 + Math.random() * 0.15);
  return mat;
}

/** Bone / chitin for blades, claws and fangs. */
export function boneMaterial(color: number = PALETTE.flesh.skin): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
}
