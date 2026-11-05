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
      wall: { texture: 'metalWall', relief: 2, roughness: 0.75, metalness: 0.3 },
      floors: [
        { share: 0.7, surface: { texture: 'floorPlate', relief: 1.2, roughness: 0.7, metalness: 0.35 } },
        { share: 0.3, surface: { texture: 'floorGrate', relief: 1.5, roughness: 0.6, metalness: 0.45 } }
      ],
      ceiling: { texture: 'ceiling', relief: 2, roughness: 0.8, metalness: 0.25 }
    },
    lights: {
      density: 0.14,
      kinds: [
        // Emergency red: always flickers.
        { share: 0.35, kind: { color: PALETTE.red.core, intensity: 1.4, distance: 7.5, flicker: 1 } },
        { share: 0.65, kind: { color: PALETTE.light.corridor, intensity: 1.0, distance: 7.5, flicker: 0.5 } }
      ]
    }
  },
  /**
   * Engineering deck: warmer and denser darkness, catwalk grating, amber service lamps,
   * heavy pipework. Added with data only; no code branches in ShipLevel or Engine.
   */
  'engineering': {
    id: 'engineering',
    props: [
      { id: 'pipe', density: 0.75 },
      { id: 'trim', density: 0.9 },
      { id: 'vent', density: 0.2 },
      { id: 'conduit', density: 0.6 },
      { id: 'crate', density: 0.03 }
    ],
    atmosphere: {
      fogColor: PALETTE.fogWarm,
      fogDensity: 0.1,
      ambientColor: PALETTE.ambientWarm,
      ambientIntensity: 0.2
    },
    surfaces: {
      wall: { texture: 'metalWall', relief: 2.5, roughness: 0.8, metalness: 0.3 },
      floors: [
        { share: 0.35, surface: { texture: 'floorPlate', relief: 1.2, roughness: 0.75, metalness: 0.35 } },
        { share: 0.65, surface: { texture: 'floorGrate', relief: 1.8, roughness: 0.55, metalness: 0.5 } }
      ],
      ceiling: { texture: 'ceiling', relief: 2.5, roughness: 0.85, metalness: 0.25 }
    },
    lights: {
      density: 0.16,
      kinds: [
        { share: 0.5, kind: { color: PALETTE.amber.core, intensity: 1.1, distance: 8, flicker: 0.3 } },
        { share: 0.2, kind: { color: PALETTE.red.core, intensity: 1.4, distance: 7.5, flicker: 1 } },
        { share: 0.3, kind: { color: PALETTE.light.corridor, intensity: 0.8, distance: 7, flicker: 0.6 } }
      ]
    }
  }
} satisfies Record<string, AreaTheme>;

export type ThemeId = keyof typeof THEMES;

/** `?theme=engineering` picks a theme for testing; unknown or missing falls back to the default. */
export function themeFromQuery(search: string = typeof location !== 'undefined' ? location.search : ''): ThemeId {
  const id = new URLSearchParams(search).get('theme');
  return id && id in THEMES ? (id as ThemeId) : 'ishimura-default';
}

export function getTheme(id: ThemeId): AreaTheme {
  return THEMES[id];
}
