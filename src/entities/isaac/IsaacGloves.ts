import { Vector3 } from 'three';
import { PALETTE } from '../../graphics/Palette';
import { bindPosition, sideSign, type Side } from './IsaacSkeleton';
import { Chunk, ellipseShape, loft, plate, ring, sectionSurface, tube } from './GearKit';
import type { Section } from './IsaacBody';

/**
 * Isaac's gloves (Proposal 005, 5.3): palm, four 3-segment fingers and a thumb, rubber
 * knuckle pad and cuff. Every pose is generated with the same vertex layout, so the
 * grip and open-palm poses are morph targets over the relaxed base (no finger bones).
 */

export type HandPose = 'relaxed' | 'grip' | 'open';
/** Morph target order on the gloves mesh. */
export const GLOVE_MORPHS = ['grip.L', 'open.L', 'grip.R', 'open.R'] as const;

/** Finger flexion per joint (knuckle, middle, tip) toward the palm, and spread. */
const POSES: Record<HandPose, { flex: [number, number, number]; spread: number; thumb: [Vector3, Vector3] }> = {
  relaxed: { flex: [0.32, 0.5, 0.32], spread: 0.04, thumb: [new Vector3(0.35, -0.78, 0.5), new Vector3(0.5, -0.8, 0.3)] },
  grip: { flex: [1.3, 1.45, 0.85], spread: 0, thumb: [new Vector3(0.75, -0.55, 0.35), new Vector3(0.55, -0.3, -0.6)] },
  open: { flex: [-0.06, 0.06, 0.04], spread: 0.13, thumb: [new Vector3(0.1, -0.5, 0.85), new Vector3(0.05, -0.55, 0.8)] }
};

/** Index, middle, ring, pinky: offset across the palm (+Z = thumb side) and length. */
const FINGERS: { z: number; len: number; r: number }[] = [
  { z: 0.029, len: 0.083, r: 0.0105 },
  { z: 0.0095, len: 0.09, r: 0.011 },
  { z: -0.0095, len: 0.085, r: 0.0105 },
  { z: -0.028, len: 0.068, r: 0.0095 }
];
const PHALANX = [0.45, 0.31, 0.24];
const PALM_LENGTH = 0.098;

export interface GloveBuild {
  /** One chunk per pose, same vertex layout. */
  poses: Record<HandPose, Chunk>;
  /** Vertex index of each fingertip pole (index..pinky, thumb). */
  tips: number[];
}

/** Builds one hand (bind pose, model space) in all three poses. */
export function buildGlove(side: Side): GloveBuild {
  const sg = sideSign(side);
  const W = bindPosition(`hand.${side}`);
  const palmN = new Vector3(-sg, 0, 0); // palms face the thighs in the bind pose
  const P = PALETTE.suit;
  const out = {} as Record<HandPose, Chunk>;
  let tips: number[] = [];

  for (const pose of Object.keys(POSES) as HandPose[]) {
    const def = POSES[pose];
    const c = new Chunk();
    const t: number[] = [];

    // Palm: boxy loft from the wrist to the knuckle row
    const S = (y: number, rx: number, zw: number): Section => ({ y, rx, zf: zw, zb: zw, n: 3.2, cx: W.x, cz: W.z });
    const palmSecs = [S(W.y + 0.01, 0.019, 0.036), S(W.y - 0.03, 0.021, 0.043), S(W.y - 0.07, 0.02, 0.046), S(W.y - PALM_LENGTH + 0.008, 0.017, 0.045)];
    c.append(loft(palmSecs, 'y', { color: P.panel, res: 0.016, radial: 16, capLo: 0.008, capHi: 0.006 }));
    // Knuckle pad on the back of the hand
    const back = side === 'L' ? 0 : Math.PI;
    c.append(plate(sectionSurface(palmSecs), back - 0.9, back + 0.9, W.y - PALM_LENGTH + 0.012, W.y - 0.062, {
      gap: 0.001, thick: 0.006, color: P.strap, edge: P.panel, res: 0.014
    }));

    // Fingers: tubes through the knuckle, the two inner joints and the tip
    const knuckleY = W.y - PALM_LENGTH + 0.006;
    FINGERS.forEach((f, k) => {
      const spread = def.spread * (1.5 - k);
      const d0 = new Vector3(0, -Math.cos(spread), Math.sin(spread));
      const axis = new Vector3().crossVectors(d0, palmN).normalize();
      const dir = (a: number) => d0.clone().multiplyScalar(Math.cos(a)).addScaledVector(palmN, Math.sin(a));
      const K = new Vector3(W.x, knuckleY, W.z + f.z);
      const pts = [K.clone().addScaledVector(d0, -0.02), K.clone()];
      const radii = [f.r * 1.05, f.r * 1.08];
      let acc = 0;
      let p = K.clone();
      for (let j = 0; j < 3; j++) {
        acc += def.flex[j];
        const L = f.len * PHALANX[j];
        const d = dir(acc);
        pts.push(p.clone().addScaledVector(d, L * 0.5));
        p = p.clone().addScaledVector(d, L);
        pts.push(p.clone());
        radii.push(f.r * (1 - 0.07 * (j + 0.5)), f.r * (j === 2 ? 0.8 : 1 - 0.07 * (j + 1)) * (j < 2 ? 1.06 : 1));
      }
      const ft = tube(pts, radii, 7, P.panel, axis);
      t.push(c.vertexCount + ft.vertexCount - 1);
      c.append(ft);
    });

    // Thumb: from the base of the palm on the thumb side, two segments
    const tb = new Vector3(W.x + palmN.x * 0.008, W.y - 0.03, W.z + 0.036);
    const relaxed1 = POSES.relaxed.thumb[0].clone().setX(POSES.relaxed.thumb[0].x * -sg).normalize();
    const tAxis = new Vector3().crossVectors(relaxed1, palmN).normalize();
    const td = def.thumb.map(v => v.clone().setX(v.x * -sg).normalize());
    const t1 = tb.clone().addScaledVector(td[0], 0.042);
    const t2 = t1.clone().addScaledVector(td[1], 0.034);
    const thumb = tube(
      [tb.clone().addScaledVector(td[0], -0.012), tb, tb.clone().addScaledVector(td[0], 0.021), t1, t1.clone().addScaledVector(td[1], 0.017), t2],
      [0.014, 0.0135, 0.0125, 0.0115, 0.0108, 0.0095],
      7, P.panel, tAxis
    );
    t.push(c.vertexCount + thumb.vertexCount - 1);
    c.append(thumb);

    // Cuff: flared rubber sleeve over the end of the jacket sleeve
    c.append(ring(ellipseShape(W.x, W.z), [[
      [0.036, W.y - 0.028, P.panel],
      [0.041, W.y + 0.012, P.panel],
      [0.046, W.y + 0.042, P.strap],
      [0.04, W.y + 0.046, P.strap]
    ]], 18));

    out[pose] = c;
    tips = t;
  }
  return { poses: out, tips };
}
