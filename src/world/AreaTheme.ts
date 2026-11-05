import { PALETTE } from '../graphics/Palette';
import type { SurfaceId } from '../graphics/TextureFactory';
import type { PropSpawn } from './props/PropPlacer';

/**
 * Data-only description of how an area looks. Adding an area = adding a theme here,
 * never a code branch in ShipLevel/Engine. (Proposal 004, section 3.)
 */

export type SurfaceTextureId = SurfaceId;

export interface SurfaceDef {
  texture: SurfaceTextureId;
  /** Normal map strength (0 = flat). */
  relief: number;
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
  /** Props that dress this area (see props/PropDefs.ts). */
  props: PropSpawn[];
  atmosphere: {
    fogColor: number;
    fogDensity: number;
    ambientColor: number;
    ambientIntensity: number;
  };
  surfaces: {
    wall: SurfaceDef;
    /** Floor variants picked per cell by weight (`share`), so the floor is not one repeated tile. */
    floors: Array<{ share: number; surface: SurfaceDef }>;
    ceiling: SurfaceDef;
  };
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
    props: [
      { id: 'pipe', density: 0.45 },
      { id: 'trim', density: 0.8 },
      { id: 'vent', density: 0.1 },
      { id: 'conduit', density: 0.35 },
      { id: 'crate', density: 0.06 }
    ],
    atmosphere: {
      fogColor: PALETTE.metal.void,
      fogDensity: 0.08,
      ambientColor: PALETTE.ambient,
      ambientIntensity: 0.18
    },
    surfaces: {
      wall: { texture: 'metalWall', relief: 2, roughness: 0.3, metalness: 0.9 },
      floors: [
        { share: 0.7, surface: { texture: 'floorPlate', relief: 1.2, roughness: 0.45, metalness: 0.7 } },
        { share: 0.3, surface: { texture: 'floorGrate', relief: 1.5, roughness: 0.4, metalness: 0.8 } }
      ],
      ceiling: { texture: 'ceiling', relief: 2, roughness: 0.5, metalness: 0.65 }
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
