import { PALETTE } from '../graphics/Palette';

/**
 * Data-only description of how an area looks. Adding an area = adding a theme here,
 * never a code branch in ShipLevel/Engine. (Proposal 004, section 3.)
 */

export type SurfaceTextureId = 'metalWall' | 'floorGrate' | 'ceiling';

export interface SurfaceDef {
  texture: SurfaceTextureId;
  roughness: number;
  metalness: number;
}

export interface LightKind {
  color: number;
  intensity: number;
  distance: number;
  /** Chance (0-1) that a light of this kind flickers. */
  flicker: number;
}

export interface AreaTheme {
  id: string;
  atmosphere: {
    fogColor: number;
    fogDensity: number;
    ambientColor: number;
    ambientIntensity: number;
  };
  surfaces: { wall: SurfaceDef; floor: SurfaceDef; ceiling: SurfaceDef };
  /** Practical lights placed in corridors. `share` values are relative weights. */
  lights: {
    /** Probability per open cell of getting a light. */
    density: number;
    kinds: Array<{ share: number; kind: LightKind }>;
  };
}

export const THEMES = {
  /** The look the game shipped with before the theme system; must stay visually identical. */
  'ishimura-default': {
    id: 'ishimura-default',
    atmosphere: {
      fogColor: PALETTE.metal.void,
      fogDensity: 0.08,
      ambientColor: PALETTE.ambient,
      ambientIntensity: 0.18
    },
    surfaces: {
      wall: { texture: 'metalWall', roughness: 0.3, metalness: 0.9 },
      floor: { texture: 'floorGrate', roughness: 0.4, metalness: 0.8 },
      ceiling: { texture: 'ceiling', roughness: 0.5, metalness: 0.65 }
    },
    lights: {
      density: 0.14,
      kinds: [
        // Emergency red: always flickers.
        { share: 0.35, kind: { color: PALETTE.red.core, intensity: 1.4, distance: 7.5, flicker: 1 } },
        { share: 0.65, kind: { color: PALETTE.light.corridor, intensity: 1.0, distance: 7.5, flicker: 0.5 } }
      ]
    }
  }
} satisfies Record<string, AreaTheme>;

export type ThemeId = keyof typeof THEMES;

export function getTheme(id: ThemeId): AreaTheme {
  return THEMES[id];
}
