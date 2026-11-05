import { Bone, Skeleton, Vector3 } from 'three';

/**
 * Isaac's skeleton as data: the single source used by the body generator, the
 * animator, the debug viewer and the numeric checks.
 *
 * Conventions:
 * - Model space, origin at the feet, +Y up, Isaac faces +Z.
 * - `.L` is Isaac's anatomical left = +X (screen-left of the follow camera).
 * - Bind pose has identity rotations: arms hang straight down, legs straight.
 *   Animation rotations are absolute local Euler angles from that pose
 *   (thigh/upperarm `x < 0` swings forward, shin `x > 0` flexes the knee,
 *   forearm `x < 0` flexes the elbow, upperarm `z * side > 0` abducts).
 *
 * Heights are measured on the Level 1 suit reference (566 px = 1.82 m): knee pad
 * ~0.57, belt ~1.04, crotch ~0.80, shoulder joints ~1.47 (set to 1.455 to leave room
 * for the neck and collar), helmet top 1.82.
 */

/** Glove length from the wrist (hand bone) to the fingertips; the gloves in phase 3 use it. */
export const HAND_LENGTH = 0.19;

export type Side = 'L' | 'R';
export type LimbBone = 'clavicle' | 'upperarm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot' | 'toe';
export type BoneName = 'hips' | 'spine1' | 'spine2' | 'neck' | 'head' | `${LimbBone}.${Side}`;

export interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** Bind position in model space. */
  pos: [number, number, number];
}

/** Center-line and left-side bones; right side is mirrored on X. */
const CENTER: BoneDef[] = [
  { name: 'hips', parent: null, pos: [0, 0.98, 0] },
  { name: 'spine1', parent: 'hips', pos: [0, 1.1, -0.005] },
  { name: 'spine2', parent: 'spine1', pos: [0, 1.27, -0.01] },
  { name: 'neck', parent: 'spine2', pos: [0, 1.51, -0.016] },
  { name: 'head', parent: 'neck', pos: [0, 1.6, -0.005] }
];

const LEFT: { name: LimbBone; parent: BoneName | LimbBone; pos: [number, number, number] }[] = [
  { name: 'clavicle', parent: 'spine2', pos: [0.035, 1.445, 0] },
  { name: 'upperarm', parent: 'clavicle', pos: [0.2, 1.455, -0.01] },
  // Elbow and knee axes sit off the limb center (olecranon behind, patella in front),
  // which keeps the stretched side of the bend short
  { name: 'forearm', parent: 'upperarm', pos: [0.2, 1.165, -0.035] },
  { name: 'hand', parent: 'forearm', pos: [0.2, 0.905, -0.01] },
  { name: 'thigh', parent: 'hips', pos: [0.1, 0.93, 0] },
  { name: 'shin', parent: 'thigh', pos: [0.1, 0.535, 0.025] },
  { name: 'foot', parent: 'shin', pos: [0.1, 0.1, -0.005] },
  { name: 'toe', parent: 'foot', pos: [0.1, 0.025, 0.13] }
];

const LIMB_PARENTS = new Set<string>(LEFT.map(b => b.name));

export const BONE_DEFS: BoneDef[] = [
  ...CENTER,
  ...(['L', 'R'] as Side[]).flatMap(side =>
    LEFT.map(b => ({
      name: `${b.name}.${side}` as BoneName,
      parent: (LIMB_PARENTS.has(b.parent) ? `${b.parent}.${side}` : b.parent) as BoneName,
      pos: [side === 'L' ? b.pos[0] : -b.pos[0], b.pos[1], b.pos[2]] as [number, number, number]
    }))
  )
];

export const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(
  BONE_DEFS.map((b, i) => [b.name, i])
) as Record<BoneName, number>;

/** X sign of a side: L = +1, R = -1. */
export const sideSign = (side: Side): number => (side === 'L' ? 1 : -1);

/** Joint limits (local Euler x, radians) used by the numeric checks. */
export const JOINT_LIMITS: Partial<Record<LimbBone, { x: [number, number] }>> = {
  shin: { x: [0, 2.4] }, // knee only flexes backward
  forearm: { x: [-2.6, 0] } // elbow only flexes forward
};

export function bindPosition(name: BoneName): Vector3 {
  return new Vector3(...BONE_DEFS[BONE_INDEX[name]].pos);
}

export interface IsaacBones {
  root: Bone;
  skeleton: Skeleton;
  bone: Record<BoneName, Bone>;
}

/** Builds the Bone hierarchy in bind pose (identity rotations). */
export function buildSkeleton(): IsaacBones {
  const bone = {} as Record<BoneName, Bone>;
  const list: Bone[] = [];
  for (const def of BONE_DEFS) {
    const b = new Bone();
    b.name = def.name;
    const parentPos = def.parent ? BONE_DEFS[BONE_INDEX[def.parent]].pos : [0, 0, 0];
    b.position.set(def.pos[0] - parentPos[0], def.pos[1] - parentPos[1], def.pos[2] - parentPos[2]);
    if (def.parent) bone[def.parent].add(b);
    bone[def.name] = b;
    list.push(b);
  }
  return { root: bone.hips, skeleton: new Skeleton(list), bone };
}

/** Resets every bone to the bind pose (rotation identity, bind offsets). */
export function resetToBind(bones: IsaacBones): void {
  for (const def of BONE_DEFS) {
    const b = bones.bone[def.name];
    const parentPos = def.parent ? BONE_DEFS[BONE_INDEX[def.parent]].pos : [0, 0, 0];
    b.position.set(def.pos[0] - parentPos[0], def.pos[1] - parentPos[1], def.pos[2] - parentPos[2]);
    b.rotation.set(0, 0, 0);
  }
}
