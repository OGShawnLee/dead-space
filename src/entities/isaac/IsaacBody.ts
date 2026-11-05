import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3
} from 'three';
import { PALETTE } from '../../graphics/Palette';
import { BONE_INDEX, bindPosition, sideSign, type BoneName, type Side } from './IsaacSkeleton';

/**
 * Isaac's skinned fabric body (Proposal 005, 5.2): jacket/torso with neck, sleeves and
 * trousers, lofted as smooth tubes in the bind pose and skinned to the skeleton with
 * procedural weights (cosine blend across each joint, at most 2 bones per vertex).
 * Panels are vertex colors, so the whole body is one material and one draw call.
 * Arms and legs are separate closed tubes that start inside the torso; the seams are
 * hidden by the shoulder caps and the belt.
 */

/** A control cross-section: superellipse with separate front/back depth. */
export interface Section {
  y: number;
  /** Half width (X). */
  rx: number;
  /** Depth toward the front (+Z) and toward the back (-Z) from the center. */
  zf: number;
  zb: number;
  /** Superellipse exponent: 2 = ellipse, higher = boxier. */
  n?: number;
  cx?: number;
  cz?: number;
}

type Weights = [BoneName, number][];

interface LoftSpec {
  sections: Section[];
  /** Ring spacing in meters. */
  step: number;
  /** Angles around the tube (radians, 0 = +X, PI/2 = +Z front). Seam at the first one. */
  angles: number[];
  capTop: number;
  capBottom: number;
  weights(p: Vector3): Weights;
  color(p: Vector3, theta: number): number;
  /** Radial offset in meters (seams, folds, creases). */
  detail?(theta: number, y: number): number;
}

// ── Interpolation: monotone cubic (PCHIP) so sections never overshoot ──

function pchip(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (x > xs[i + 1]) i++;
  const h = (k: number) => xs[k + 1] - xs[k];
  const d = (k: number) => (ys[k + 1] - ys[k]) / h(k);
  const slope = (k: number) => {
    if (k === 0) return d(0);
    if (k === n - 1) return d(n - 2);
    const a = d(k - 1), b = d(k);
    if (a * b <= 0) return 0;
    const w1 = 2 * h(k) + h(k - 1), w2 = h(k) + 2 * h(k - 1);
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const t = (x - xs[i]) / h(i);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h(i) * slope(i)
    + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h(i) * slope(i + 1);
}

export function sampleSection(sorted: Section[], y: number): Required<Section> {
  const ys = sorted.map(s => s.y);
  const f = (k: keyof Section, def: number) => pchip(ys, sorted.map(s => (s[k] as number | undefined) ?? def), y);
  return { y, rx: f('rx', 0), zf: f('zf', 0), zb: f('zb', 0), n: f('n', 2), cx: f('cx', 0), cz: f('cz', 0) };
}

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Fraction of a blend spent easing in and out (the rest is linear). */
const EASE = 0.25;

/**
 * 0 at `from`, 1 at `to` (either order). Linear in the middle with quadratic ease at
 * both ends: the slope peaks at 1 / (1 - EASE) = 1.33x the mean, against PI/2 for a
 * cosine blend, so skinned joints stretch less for the same blend width.
 */
export function blend(v: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (v - from) / (to - from)));
  const k = 1 / (1 - EASE);
  if (t < EASE) return (k * t * t) / (2 * EASE);
  if (t > 1 - EASE) return 1 - (k * (1 - t) * (1 - t)) / (2 * EASE);
  return k * (EASE / 2 + (t - EASE));
}

/** Weights along a vertical bone chain (top to bottom) with joints at the given heights. */
function chainWeights(y: number, bones: BoneName[], joints: number[], halfWidths: number[]): Weights {
  for (let k = 0; k < joints.length; k++) {
    const j = joints[k], h = halfWidths[k];
    if (y > j + h) return [[bones[k], 1]];
    if (y >= j - h) {
      const below = blend(y, j + h, j - h);
      return [[bones[k], 1 - below], [bones[k + 1], below]];
    }
  }
  return [[bones[bones.length - 1], 1]];
}

/** Uniform angles plus optional extra samples (for thin seams), sorted, starting at `seam`. */
function angleList(count: number, seam = 0, extra: number[] = []): number[] {
  const tau = Math.PI * 2;
  // Offsets from the seam in [0, tau), deduplicated, ascending
  const offset = (a: number) => Math.round(((((a - seam) % tau) + tau) % tau) * 1e6) / 1e6;
  const all = [...Array.from({ length: count }, (_, i) => (i / count) * tau), ...extra.map(offset)];
  return [...new Set(all.map(a => Math.round(a * 1e6) / 1e6))].sort((a, b) => a - b).map(a => seam + a);
}

// ── Geometry accumulation ──

class BodyBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  skinIndex: number[] = [];
  skinWeight: number[] = [];
  indices: number[] = [];
  /** Vertices that needed more than 2 bones (the extra weight was dropped); should be 0. */
  droppedWeights = 0;
  private color = new Color();

  loft(spec: LoftSpec): void {
    const sorted = [...spec.sections].sort((a, b) => a.y - b.y);
    const yBot = sorted[0].y;
    const yTop = sorted[sorted.length - 1].y;

    // Rings top to bottom: { section, scale toward its center, height }
    const rings: { s: Required<Section>; scale: number; y: number }[] = [];
    const capRings = (h: number) => Math.max(3, Math.round(h / (spec.step * 0.6)) + 2);
    const top = sampleSection(sorted, yTop);
    const kTop = capRings(spec.capTop);
    for (let k = 0; k < kTop; k++) {
      const phi = (1 - k / kTop) * (Math.PI / 2);
      rings.push({ s: top, scale: Math.cos(phi), y: yTop + Math.sin(phi) * spec.capTop });
    }
    const count = Math.max(2, Math.ceil((yTop - yBot) / spec.step));
    for (let i = 0; i <= count; i++) {
      const y = yTop - ((yTop - yBot) * i) / count;
      rings.push({ s: sampleSection(sorted, y), scale: 1, y });
    }
    const bot = sampleSection(sorted, yBot);
    const kBot = capRings(spec.capBottom);
    for (let k = kBot - 1; k >= 0; k--) {
      const phi = (1 - k / kBot) * (Math.PI / 2);
      rings.push({ s: bot, scale: Math.cos(phi), y: yBot - Math.sin(phi) * spec.capBottom });
    }

    const angles = spec.angles;
    const N = angles.length;
    const grid: Vector3[][] = rings.map(({ s, scale, y }) =>
      angles.map(theta => {
        const e = 2 / s.n;
        const c = Math.cos(theta), si = Math.sin(theta);
        const dr = scale > 0.999 && spec.detail ? spec.detail(theta, y) : 0;
        const x = (s.rx + dr) * scale * sgnPow(c, e);
        const z = ((si >= 0 ? s.zf : s.zb) + dr) * scale * sgnPow(si, e);
        return new Vector3(s.cx + x, y, s.cz + z);
      })
    );

    const base = this.positions.length / 3;
    const n = new Vector3(), du = new Vector3(), dv = new Vector3();
    const R = rings.length;
    let v = 0;
    for (let i = 0; i < R; i++) {
      if (i > 0) v += Math.abs(rings[i - 1].y - rings[i].y) + 1e-4;
      for (let j = 0; j <= N; j++) {
        const jj = j % N;
        const p = grid[i][jj];
        du.subVectors(grid[i][(jj + 1) % N], grid[i][(jj - 1 + N) % N]);
        dv.subVectors(grid[Math.min(R - 1, i + 1)][jj], grid[Math.max(0, i - 1)][jj]);
        n.crossVectors(du, dv);
        if (n.lengthSq() < 1e-14) n.set(0, i < R / 2 ? 1 : -1, 0);
        n.normalize();

        this.positions.push(p.x, p.y, p.z);
        this.normals.push(n.x, n.y, n.z);
        this.uvs.push(j / N, v);
        this.color.setHex(spec.color(p, angles[jj]));
        this.colors.push(this.color.r, this.color.g, this.color.b);

        const all = spec.weights(p).filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]);
        if (all.length > 2 && all[2][1] > 0.01) this.droppedWeights++;
        const w = all.slice(0, 2);
        const sum = w.reduce((acc, [, x]) => acc + x, 0);
        this.skinIndex.push(BONE_INDEX[w[0][0]], w[1] ? BONE_INDEX[w[1][0]] : 0, 0, 0);
        this.skinWeight.push(w[0][1] / sum, w[1] ? w[1][1] / sum : 0, 0, 0);
      }
    }

    const row = N + 1;
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < N; j++) {
        const a = base + i * row + j, b = a + row, c = a + 1, d = b + 1;
        this.indices.push(a, c, b, c, d, b);
      }
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.skinWeight, 4));
    g.setIndex(this.indices);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.droppedWeights = this.droppedWeights;
    return g;
  }
}

// ── Body parts ──

const S = PALETTE.suit;
const FRONT = Math.PI / 2;
const BACK = -Math.PI / 2;
/** Shortest angular distance. */
const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Torso control sections (crotch to neck), ascending y. Exported for the numeric checks. */
export const TORSO_SECTIONS: Section[] = [
  { y: 0.795, rx: 0.1, zf: 0.06, zb: 0.104, n: 2.2, cz: -0.006 },
  { y: 0.83, rx: 0.16, zf: 0.088, zb: 0.114, n: 2.4, cz: -0.008 },
  { y: 0.9, rx: 0.19, zf: 0.102, zb: 0.126, n: 2.5, cz: -0.01 }, // hips
  { y: 0.96, rx: 0.186, zf: 0.104, zb: 0.12, n: 2.5, cz: -0.01 },
  { y: 1.02, rx: 0.168, zf: 0.103, zb: 0.108, n: 2.5, cz: -0.008 },
  { y: 1.08, rx: 0.152, zf: 0.1, zb: 0.1, n: 2.5, cz: -0.005 }, // waist
  { y: 1.13, rx: 0.149, zf: 0.104, zb: 0.098, n: 2.5, cz: -0.004 },
  { y: 1.2, rx: 0.152, zf: 0.122, zb: 0.104, n: 2.6, cz: -0.003 },
  { y: 1.27, rx: 0.155, zf: 0.14, zb: 0.114, n: 2.6, cz: -0.002 },
  { y: 1.33, rx: 0.166, zf: 0.15, zb: 0.12, n: 2.7, cz: -0.004 }, // chest
  { y: 1.38, rx: 0.166, zf: 0.145, zb: 0.12, n: 2.8, cz: -0.006 },
  { y: 1.425, rx: 0.16, zf: 0.128, zb: 0.114, n: 2.8, cz: -0.01 },
  { y: 1.455, rx: 0.15, zf: 0.11, zb: 0.104, n: 2.7, cz: -0.012 }, // shoulder line
  { y: 1.48, rx: 0.128, zf: 0.093, zb: 0.094, n: 2.5, cz: -0.014 },
  { y: 1.505, rx: 0.1, zf: 0.076, zb: 0.08, n: 2.3, cz: -0.016 }, // trapezius
  { y: 1.528, rx: 0.072, zf: 0.06, zb: 0.065, n: 2.1, cz: -0.016 }, // neck base
  { y: 1.555, rx: 0.056, zf: 0.052, zb: 0.054, n: 2, cz: -0.014 },
  { y: 1.6, rx: 0.053, zf: 0.05, zb: 0.05, n: 2, cz: -0.008 },
  { y: 1.63, rx: 0.052, zf: 0.05, zb: 0.05, n: 2, cz: -0.005 }
];

/** Torso from crotch to neck: trousers seat, belt line, jacket, shoulders, neck. */
function torso(builder: BodyBuilder): void {
  const seam = 0.025;
  builder.loft({
    sections: TORSO_SECTIONS,
    step: 0.014,
    // UV seam at the back (under the RIG); extra samples make the front zip seam crisp
    angles: angleList(48, BACK, [FRONT - 0.045, FRONT - 0.022, FRONT + 0.022, FRONT + 0.045]),
    capTop: 0.02,
    capBottom: 0.03,
    detail(theta, y) {
      let dr = 0;
      // Raised center seam on the jacket front
      if (y > 1.08 && y < 1.5 && angDist(theta, FRONT) < seam) dr += 0.0035;
      // Soft folds just above the belt
      if (y > 1.075 && y < 1.17) dr += 0.0025 * Math.sin((y - 1.075) * 180 + 1.4 * Math.sin(theta * 3)) * blend(y, 1.17, 1.12);
      // Trouser creases at the front of the hips
      if (y > 0.82 && y < 0.93 && Math.sin(theta) > 0.3) dr += 0.002 * Math.sin(theta * 9 + y * 40);
      return dr;
    },
    color(p, theta) {
      const y = p.y;
      if (y > 1.525) return S.panel; // neck seal
      if (y < 1.01) return S.fabricDark; // trousers
      if (y < 1.07) return S.strap; // belt band (provisional belt sits on it)
      if (y > 1.42 && Math.abs(p.x) > 0.1) return S.panel; // shoulder yoke
      if (y < 1.37 && Math.abs(Math.cos(theta)) > 0.88) return S.panel; // side panels under the arms
      if (y > 1.08 && y < 1.36 && p.x < -0.055 && p.x > -0.135 && Math.sin(theta) > 0.4) return S.panel; // padded chest panel
      return S.fabric;
    },
    weights(p) {
      const y = p.y;
      // Neck blend starts above the clavicle zone so no vertex needs 3 bones
      const w = chainWeights(y, ['head', 'neck', 'spine2', 'spine1', 'hips'], [1.6, 1.525, 1.27, 1.1], [0.02, 0.025, 0.07, 0.06]);
      // Shoulder tops follow the clavicles (fading out up the trapezius, below the neck blend)
      const clav = blend(Math.abs(p.x), 0.08, 0.14) * blend(y, 1.38, 1.44) * (1 - blend(y, 1.47, 1.5));
      if (clav > 0) {
        w.forEach(e => (e[1] *= 1 - clav));
        w.push([p.x > 0 ? 'clavicle.L' : 'clavicle.R', clav]);
      }
      // Seat and crotch partly follow the thighs, so the legs do not tear the trousers
      const thigh = blend(y, 0.95, 0.79) * 0.4 * blend(Math.abs(p.x), 0, 0.12);
      if (thigh > 0) {
        w.forEach(e => (e[1] *= 1 - thigh));
        w.push([p.x > 0 ? 'thigh.L' : 'thigh.R', thigh]);
      }
      return w;
    }
  });
}

/** Trouser leg control sections (ascending y), centered on the hip joint. Exported for the gear fit. */
export function legSections(side: Side): Section[] {
  const hip = bindPosition(`thigh.${side}`);
  const L = (y: number, rx: number, zf: number, zb: number, n = 2.1): Section => ({ y, rx, zf, zb, n, cx: hip.x, cz: hip.z });
  return [
    L(0.13, 0.044, 0.046, 0.046),
    L(0.22, 0.05, 0.052, 0.054),
    L(0.33, 0.06, 0.06, 0.068),
    L(0.42, 0.067, 0.066, 0.078), // calf
    L(0.49, 0.066, 0.07, 0.072),
    L(0.535, 0.069, 0.072, 0.066), // knee
    L(0.585, 0.074, 0.078, 0.072),
    // The seat falls straight from the buttocks to the thigh (no fold under the torso)
    L(0.64, 0.084, 0.082, 0.081),
    L(0.72, 0.092, 0.09, 0.097),
    L(0.8, 0.097, 0.094, 0.114),
    L(0.88, 0.098, 0.095, 0.124),
    L(0.95, 0.092, 0.09, 0.112),
    L(0.99, 0.07, 0.075, 0.08)
  ];
}

function leg(builder: BodyBuilder, side: Side): void {
  const sg = sideSign(side);
  builder.loft({
    sections: legSections(side),
    step: 0.02,
    angles: angleList(22, side === 'L' ? Math.PI : 0), // seam on the inner side
    capTop: 0.04,
    capBottom: 0.03,
    detail(theta, y) {
      // Fabric bunching behind the knee and at the front of the thigh
      let dr = 0;
      if (y > 0.49 && y < 0.6 && Math.sin(theta) < -0.2) dr += 0.004 * Math.sin((y - 0.49) * 140) * blend(y, 0.6, 0.56);
      if (y > 0.86 && y < 0.95 && Math.sin(theta) > 0.2) dr += 0.0025 * Math.sin(theta * 5 * sg + y * 60);
      return dr;
    },
    color: () => S.fabricDark,
    weights(p) {
      // The thigh top is a dome inside the pelvis and turns rigidly with the thigh
      return chainWeights(p.y, [`thigh.${side}`, `shin.${side}`, `foot.${side}`], [0.535, 0.1], [0.09, 0.03]);
    }
  });
}

/** Sleeve control sections (ascending y), centered on the shoulder joint. Exported for the gear fit. */
export function armSections(side: Side): Section[] {
  const sh = bindPosition(`upperarm.${side}`);
  const sg = sideSign(side);
  // `dx` moves the ring toward the body: the deltoid sits over the joint, not beside it
  const A = (y: number, rx: number, zf: number, zb: number, dx = 0, n = 2.1): Section => ({ y, rx, zf, zb, n, cx: sh.x - sg * dx, cz: sh.z });
  return [
    A(0.925, 0.037, 0.032, 0.032), // wrist
    A(1.0, 0.045, 0.042, 0.04),
    A(1.07, 0.055, 0.053, 0.05), // forearm
    A(1.13, 0.055, 0.055, 0.054),
    A(1.165, 0.05, 0.05, 0.056), // elbow
    A(1.2, 0.051, 0.052, 0.055),
    A(1.27, 0.055, 0.058, 0.055),
    A(1.34, 0.059, 0.066, 0.058), // biceps
    A(1.4, 0.06, 0.064, 0.06, 0.006),
    A(1.445, 0.058, 0.063, 0.062, 0.012), // deltoid
    A(1.475, 0.05, 0.053, 0.053, 0.014)
  ];
}

function arm(builder: BodyBuilder, side: Side): void {
  builder.loft({
    sections: armSections(side),
    step: 0.018,
    angles: angleList(20, side === 'L' ? Math.PI : 0),
    capTop: 0.035,
    capBottom: 0.02,
    detail(theta, y) {
      // Sleeve bunching inside the elbow
      return y > 1.125 && y < 1.215 && Math.sin(theta) > 0.3 ? 0.003 * Math.sin((y - 1.125) * 150) : 0;
    },
    color: p => (p.y > 1.355 ? S.panel : S.fabric),
    weights(p) {
      // The arm top is a dome inside the shoulder and turns rigidly with the upper arm
      return chainWeights(p.y, [`upperarm.${side}`, `forearm.${side}`, `hand.${side}`], [1.165, 0.905], [0.075, 0.025]);
    }
  });
}

export const BODY_MATERIAL_PARAMS = { roughness: 0.85, metalness: 0 } as const;

/**
 * Builds the skinned body geometry (bind pose). The caller adds it next to the bones,
 * updates world matrices with the bones in bind pose and calls `mesh.bind(skeleton)`.
 */
export function buildBody(): SkinnedMesh {
  const builder = new BodyBuilder();
  torso(builder);
  for (const side of ['L', 'R'] as Side[]) {
    leg(builder, side);
    arm(builder, side);
  }
  const mesh = new SkinnedMesh(builder.build(), new MeshStandardMaterial({ vertexColors: true, ...BODY_MATERIAL_PARAMS }));
  mesh.name = 'isaac-body';
  mesh.castShadow = false;
  // Isaac is always in view; skip per-frame skinned bounds
  mesh.frustumCulled = false;
  return mesh;
}
