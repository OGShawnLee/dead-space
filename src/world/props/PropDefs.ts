import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../graphics/Palette';
import { TextureFactory } from '../../graphics/TextureFactory';

/**
 * Prop registry (data + tiny factories). Adding a prop = one entry here, then
 * list it in an AreaTheme. Geometry is authored centered; its length runs along
 * local X and its thickness along local Z (+Z points away from the wall).
 */
export type PropPlacement = 'wall' | 'ceiling' | 'floor';

export interface PropDef {
  placement: PropPlacement;
  /** Center height of the prop above the floor (ignored for ceiling props). */
  y: number;
  /** Thickness along local Z; used to sit the prop flush against the wall. */
  depth: number;
  geometry: () => BufferGeometry;
  material: () => Material;
  /** Adds a collider so the player and enemies cannot walk through it. */
  collider?: boolean;
  /** Per-instance brightness variation (0 = none). */
  tintVariance: number;
}

const CELL = 4;

/** Cargo container: body, top/bottom frames, corner posts and vertical ribs on every face. */
function crateGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    parts.push(new BoxGeometry(w, h, d).translate(x, y, z));

  box(0.84, 0.84, 0.84, 0, 0, 0); // body
  box(0.9, 0.07, 0.9, 0, 0.415, 0); // top frame
  box(0.9, 0.07, 0.9, 0, -0.415, 0); // bottom frame
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(0.07, 0.9, 0.07, sx * 0.415, 0, sz * 0.415); // corner posts
  }
  for (const x of [-0.2, 0.2]) {
    box(0.06, 0.76, 0.9, x, 0, 0); // ribs on front/back (run through)
    box(0.9, 0.76, 0.06, 0, 0, x); // ribs on left/right
  }
  box(0.5, 0.03, 0.5, 0, 0.455, 0); // raised lid plate

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged!;
}

const metal = (color: number, roughness = 0.55, metalness = 0.35) =>
  () => new MeshStandardMaterial({ color, roughness, metalness });

export const PROPS = {
  /** Horizontal pipe run along a wall, high up. */
  pipe: {
    placement: 'wall',
    y: 2.85,
    depth: 0.2,
    geometry: () => new CylinderGeometry(0.09, 0.09, CELL * 0.98, 8).rotateZ(Math.PI / 2),
    material: metal(PALETTE.metal.m500),
    tintVariance: 0.25
  },
  /** Low baseboard trim along a wall. */
  trim: {
    placement: 'wall',
    y: 0.14,
    depth: 0.1,
    geometry: () => new BoxGeometry(CELL * 0.98, 0.28, 0.1),
    material: metal(PALETTE.metal.m700),
    tintVariance: 0.15
  },
  /** Wall vent panel. */
  vent: {
    placement: 'wall',
    y: 1.7,
    depth: 0.14,
    geometry: () => new BoxGeometry(0.9, 0.55, 0.14),
    material: metal(PALETTE.metal.m900, 0.8, 0.2),
    tintVariance: 0.2
  },
  /** Overhead conduit beam. */
  conduit: {
    placement: 'ceiling',
    y: 0,
    depth: 0.4,
    geometry: () => new BoxGeometry(CELL * 0.98, 0.2, 0.4),
    material: metal(PALETTE.metal.m700),
    tintVariance: 0.2
  },
  /** Metal cargo container pushed against a wall. */
  crate: {
    placement: 'floor',
    y: 0.45,
    depth: 0.9,
    geometry: crateGeometry,
    material: () => {
      const { map, normalMap, roughnessMap } = TextureFactory.surfaceMaps('crateSteel', 3);
      return new MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 0.7, metalness: 0.45 });
    },
    collider: true,
    tintVariance: 0.3
  }
} satisfies Record<string, PropDef>;

export type PropId = keyof typeof PROPS;
