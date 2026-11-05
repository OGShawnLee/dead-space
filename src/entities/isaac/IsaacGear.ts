import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  type Material
} from 'three';
import { PALETTE } from '../../graphics/Palette';
import { BONE_DEFS, BONE_INDEX, bindPosition, sideSign, type BoneName, type IsaacBones, type Side } from './IsaacSkeleton';
import { TORSO_SECTIONS, armSections, legSections, type Section } from './IsaacBody';
import {
  Chunk,
  chunkGeometry,
  ellipseShape,
  extrude,
  frame,
  lateral,
  loft,
  plate,
  radialSurface,
  rivetGeometry,
  ring,
  roundedBox,
  sag,
  sectionShape,
  sectionSurface,
  sph,
  surfaceNormal,
  type ProfilePoint,
  type Surface
} from './GearKit';
import { GLOVE_MORPHS, buildGlove } from './IsaacGloves';

/**
 * Isaac's rigid gear (Proposal 005, 5.3): helmet, collar, chest yoke, shoulder caps,
 * forearm bracers, gloves, belt and pouches, knee pads, thigh pockets and straps, boots.
 *
 * Every piece is built in model-space bind coordinates on the body's own surfaces and
 * belongs to one bone. Pieces are merged per material class into skinned meshes with
 * rigid weights (one bone, weight 1), so the whole suit is a handful of draw calls
 * whatever the number of bones. Rivets are one InstancedMesh that follows the bones.
 */

export type GearClass = 'metal' | 'soft' | 'visor';

export interface GearPiece {
  name: string;
  bone: BoneName;
  cls: GearClass;
  chunk: Chunk;
}

export interface RivetDef {
  bone: BoneName;
  /** Bind transform in model space (rivet head along +Y). */
  matrix: Matrix4;
}

const S = PALETTE.suit;
const TAU = Math.PI * 2;
const FRONT = Math.PI / 2;
const BACK = -Math.PI / 2;
const Y = new Vector3(0, 1, 0);

/** Rivet head radius (m). */
export const RIVET_RADIUS = 0.0045;

class GearSet {
  readonly pieces: GearPiece[] = [];
  readonly rivets: RivetDef[] = [];

  add(name: string, bone: BoneName, cls: GearClass, chunk: Chunk): void {
    this.pieces.push({ name, bone, cls, chunk });
  }

  /** Rivet on a surface point, `lift` meters above it. */
  rivetOn(bone: BoneName, s: Surface, u: number, v: number, lift: number, scale = 1): void {
    const p = s.point(u, v, new Vector3());
    const n = surfaceNormal(s, u, v, new Vector3());
    this.rivetAt(bone, p.addScaledVector(n, lift), n, scale);
  }

  rivetAt(bone: BoneName, p: Vector3, n: Vector3, scale = 1): void {
    const q = new Quaternion().setFromUnitVectors(Y, n.clone().normalize());
    this.rivets.push({ bone, matrix: new Matrix4().compose(p, q, new Vector3(scale, scale, scale)) });
  }
}

/** Matrix that maps +Y to `normal` at `pos`. */
const alignY = (pos: Vector3, normal: Vector3): Matrix4 =>
  new Matrix4().compose(pos, new Quaternion().setFromUnitVectors(Y, normal.clone().normalize()), new Vector3(1, 1, 1));

// ── Helmet ──

/** Helmet shell: superellipsoid centered over the head, slightly deeper at the front. */
export const HELMET = {
  center: new Vector3(0, 1.7, 0.012),
  radii: { x: 0.086, up: 0.118, down: 0.13, front: 0.118, back: 0.108 },
  n: 2.6,
  /** Elevation of the bottom rim (radians). */
  rimElevation: -1.1
};

function helmet(g: GearSet): void {
  const hs = radialSurface(HELMET.center, HELMET.radii, HELMET.n, sph);
  const hg = radialSurface(HELMET.center, HELMET.radii, HELMET.n, sag);
  const cu = { color: S.copper, edge: S.copperHi, wall: S.copperDark };

  // Dark base shell: shows through the grooves between plates and behind the visor slits
  g.add('helmet.shell', 'head', 'metal', plate(hs, -Math.PI, Math.PI, HELMET.rimElevation, 1.5, {
    closedU: true, gap: 0, thick: 0.004, color: S.copperDark, res: 0.028
  }));

  // Face frame around three horizontal visor slits
  const face = (name: string, u0: number, u1: number, v0: number, v1: number) =>
    g.add(`helmet.${name}`, 'head', 'metal', plate(hs, u0, u1, v0, v1, { gap: 0, thick: 0.011, res: 0.022, ...cu }));
  face('brow', -0.6, 0.6, 0.22, 0.37);
  face('bar1', -0.5, 0.5, 0.06, 0.1);
  face('bar2', -0.5, 0.5, -0.1, -0.06);
  face('chin', -0.62, 0.62, -0.58, -0.22);
  face('frame.L', 0.48, 0.66, -0.52, 0.37);
  face('frame.R', -0.66, -0.48, -0.52, 0.37);
  // Slits: lighter center, pale rim (no post-processing glow)
  for (const [k, v0, v1] of [[1, 0.11, 0.21], [2, -0.05, 0.05], [3, -0.21, -0.11]] as const) {
    g.add(`helmet.slit${k}`, 'head', 'visor', plate(hs, -0.47, 0.47, v0, v1, {
      gap: 0.0045, thick: 0.002, color: PALETTE.rig.glow, edge: PALETTE.rig.ok, res: 0.02
    }));
  }

  // Segmented crest over the top, two ribbed bands per side
  const crest: [number, number][] = [[0.62, 1.13], [1.155, 1.67], [1.695, 2.21], [2.235, 2.85]];
  crest.forEach(([a0, a1], k) => g.add(`helmet.crest${k}`, 'head', 'metal', plate(hg, a0, a1, -0.07, 0.07, { gap: 0, thick: 0.01, res: 0.022, ...cu })));
  const bands: [number, number, [number, number][]][] = [
    [0.095, 0.33, [[0.72, 1.41], [1.435, 2.11], [2.135, 2.78]]],
    [0.355, 0.6, [[0.95, 1.61], [1.635, 2.26], [2.285, 2.72]]]
  ];
  for (const sg of [1, -1]) {
    for (const [b0, b1, segs] of bands) {
      segs.forEach(([a0, a1], k) => g.add(`helmet.band${b0}.${k}.${sg > 0 ? 'L' : 'R'}`, 'head', 'metal',
        plate(hg, a0, a1, sg > 0 ? b0 : -b1, sg > 0 ? b1 : -b0, { gap: 0, thick: 0.007, res: 0.022, ...cu })));
    }
    // Cheek and rear plates
    const side = (name: string, u0: number, u1: number, v0: number, v1: number) =>
      g.add(`helmet.${name}.${sg > 0 ? 'L' : 'R'}`, 'head', 'metal', plate(hs, sg > 0 ? u0 : -u1, sg > 0 ? u1 : -u0, v0, v1, { gap: 0, thick: 0.009, res: 0.024, ...cu }));
    side('cheek0', 0.72, 1.1, -0.64, 0.1);
    side('cheek1', 1.14, 1.56, -0.64, 0.1);
    side('rear', 1.6, 2.4, -0.68, 0.14);
    // Hinge disk over the ear
    const hp = hs.point(sg * 1.34, -0.2, new Vector3());
    const hn = surfaceNormal(hs, sg * 1.34, -0.2, new Vector3());
    g.add(`helmet.hinge.${sg > 0 ? 'L' : 'R'}`, 'head', 'metal', ring(ellipseShape(0, 0), [[
      [0.027, -0.004, S.copperDark], [0.027, 0.008, S.copper], [0.021, 0.014, S.copperHi], [0.001, 0.014, S.copper]
    ]], 14).transform(alignY(hp.addScaledVector(hn, 0.006), hn)));
    g.rivetAt('head', hs.point(sg * 1.34, -0.2, new Vector3()).addScaledVector(hn, 0.021), hn, 1.3);
    // Rivets down the face frame and on the cheeks
    for (const v of [0.28, -0.02, -0.32]) g.rivetOn('head', hs, sg * 0.57, v, 0.011);
    for (const v of [-0.45, -0.05]) g.rivetOn('head', hs, sg * 0.92, v, 0.009);
  }
  g.add('helmet.rear.C', 'head', 'metal', plate(hs, 2.45, TAU - 2.45, -0.72, 0.2, { gap: 0, thick: 0.009, res: 0.024, ...cu }));
  for (const u of [-0.4, 0, 0.4]) g.rivetOn('head', hs, u, 0.3, 0.011);
  for (const a of [0.85, 1.9]) g.rivetOn('head', hg, a, 0, 0.012);
}

// ── Collar, chest yoke, straps ──

/** Collar ring: padded gorget around the neck base, resting on the trapezius. */
export const COLLAR = { cx: 0, cz: -0.015, front: 0.92, back: 0.95 };

function collar(g: GearSet): void {
  const sh = ellipseShape(COLLAR.cx, COLLAR.cz, 1, COLLAR.front, COLLAR.back);
  const P = S.panel, T = S.strap;
  g.add('collar', 'spine2', 'soft', ring(sh, [
    [[0.072, 1.525, P], [0.09, 1.5, P], [0.13, 1.47, P], [0.15, 1.488, P]],
    [[0.15, 1.488, P], [0.158, 1.52, T], [0.155, 1.546, T], [0.142, 1.558, P]],
    [[0.142, 1.558, P], [0.1, 1.574, P], [0.08, 1.58, T]],
    [[0.08, 1.58, T], [0.072, 1.572, T], [0.072, 1.525, P]]
  ], 32));
  // Copper clasps at the front
  for (const sg of [1, -1]) {
    const th = FRONT - sg * 0.55;
    const p = sh(th, 1.53, 0.158, new Vector3());
    const n = sh(th, 1.53, 0.2, new Vector3()).sub(p).normalize();
    g.add(`collar.clasp.${sg > 0 ? 'L' : 'R'}`, 'spine2', 'metal', roundedBox(0.032, 0.036, 0.014, 0.004, S.copper, frame(p.clone().addScaledVector(n, 0.004), n)));
    g.rivetAt('spine2', p.clone().addScaledVector(n, 0.011), n);
  }
}

function chest(g: GearSet): void {
  const ts = sectionSurface(TORSO_SECTIONS);
  const cu = { color: S.copper, edge: S.copperHi, wall: S.copperDark };
  for (const sg of [1, -1]) {
    const name = sg > 0 ? 'L' : 'R';
    const [u0, u1] = sg > 0 ? [FRONT - 0.55, FRONT - 0.05] : [FRONT + 0.05, FRONT + 0.55];
    g.add(`yoke.${name}`, 'spine2', 'metal', plate(ts, u0, u1, 1.335, 1.4, { gap: 0.005, thick: 0.013, res: 0.02, ...cu }));
    g.rivetOn('spine2', ts, FRONT - sg * 0.42, 1.367, 0.018);
    // Harness straps from the yoke up under the collar (inside the clavicle blend zone)
    const [s0, s1] = sg > 0 ? [1.2, 1.32] : [Math.PI - 1.32, Math.PI - 1.2];
    g.add(`strap.${name}`, 'spine2', 'soft', plate(ts, s0, s1, 1.398, 1.5, { gap: 0.004, thick: 0.006, color: S.strap, edge: S.panel, res: 0.025 }));
  }
  const cp = ts.point(FRONT, 1.367, new Vector3());
  const cn = surfaceNormal(ts, FRONT, 1.367, new Vector3());
  g.add('yoke.clasp', 'spine2', 'metal', roundedBox(0.042, 0.052, 0.016, 0.005, S.brass, frame(cp.addScaledVector(cn, 0.014), cn)));
}

// ── Shoulders and arms ──

function shoulder(g: GearSet, side: Side): void {
  const sg = sideSign(side);
  const cs = radialSurface(new Vector3(sg * 0.158, 1.44, -0.01), { x: 0.066, up: 0.078, down: 0.07, front: 0.072, back: 0.072 }, 2.5, lateral(sg));
  const bone: BoneName = `upperarm.${side}`;
  g.add(`cap.upper.${side}`, bone, 'soft', plate(cs, -1.65, 1.65, 0.32, 1.1, { gap: 0.006, thick: 0.013, color: S.panel, edge: S.strap, res: 0.022 }));
  g.add(`cap.lower.${side}`, bone, 'soft', plate(cs, -1.4, 1.4, -0.5, 0.36, { gap: 0.003, thick: 0.011, color: S.panel, edge: S.strap, res: 0.022 }));
  for (const u of [-0.6, 0.6]) g.rivetOn(bone, cs, u, 0.75, 0.019);
}

function bracer(g: GearSet, side: Side): void {
  const secs = armSections(side);
  const sh = sectionShape(secs);
  const as = sectionSurface(secs);
  const bone: BoneName = `forearm.${side}`;
  const lat = side === 'L' ? 0 : Math.PI;
  const D = S.copperDark, C = S.copper, H = S.copperHi;
  // Base sleeve under the ribs
  g.add(`bracer.base.${side}`, bone, 'metal', ring(sh, [
    [[0.004, 0.94, D], [0.006, 1.112, D]],
    [[0.006, 1.112, D], [0.001, 1.115, D]]
  ], 14));
  // Six ribbed bands with chamfered, worn edges
  const strips: ProfilePoint[][] = [];
  for (let k = 0; k < 6; k++) {
    const y0 = 0.946 + k * 0.0275, y1 = y0 + 0.023;
    strips.push([[0.006, y0, D], [0.013, y0 + 0.004, H], [0.0148, (y0 + y1) / 2, C], [0.013, y1 - 0.004, H], [0.006, y1, D]]);
  }
  g.add(`bracer.ribs.${side}`, bone, 'metal', ring(sh, strips, 14));
  // Console plate on the back of the forearm, elbow guard behind the joint
  g.add(`bracer.plate.${side}`, bone, 'metal', plate(as, lat - 0.55, lat + 0.55, 0.985, 1.075, { gap: 0.0145, thick: 0.006, color: C, edge: H, wall: D, res: 0.02 }));
  for (const v of [1.0, 1.06]) g.rivetOn(bone, as, lat, v, 0.0205);
  g.add(`elbow.${side}`, bone, 'metal', plate(as, BACK - 0.75, BACK + 0.75, 1.13, 1.205, { gap: 0.004, thick: 0.01, color: C, edge: H, wall: D, res: 0.02 }));
}

// ── Belt ──

function belt(g: GearSet): void {
  const ts = sectionSurface(TORSO_SECTIONS);
  g.add('belt', 'hips', 'soft', plate(ts, 0, TAU, 1.012, 1.066, { closedU: true, gap: 0.004, thick: 0.012, color: S.strap, edge: S.panel, res: 0.025 }));
  g.add('belt.buckle', 'hips', 'metal', plate(ts, FRONT - 0.15, FRONT + 0.15, 1.014, 1.064, { gap: 0.016, thick: 0.007, color: S.brass, edge: S.copperHi, wall: S.copperDark, res: 0.02 }));
  g.add('belt.buckle.inset', 'hips', 'metal', plate(ts, FRONT - 0.075, FRONT + 0.075, 1.027, 1.051, { gap: 0.0235, thick: 0.004, color: S.copperDark, edge: S.brass, res: 0.02 }));
  for (const th of [FRONT - 0.75, FRONT + 0.75, BACK - 0.75, BACK + 0.75]) {
    g.add(`belt.loop.${th.toFixed(2)}`, 'hips', 'soft', plate(ts, th - 0.06, th + 0.06, 1.004, 1.074, { gap: 0.016, thick: 0.005, color: S.strap, edge: S.panel, res: 0.03 }));
  }
  // Pouches: front sides and back sides (the RIG cable takes the center back)
  for (const th of [FRONT - 1.05, FRONT + 1.05, BACK - 0.75, BACK + 0.75]) {
    const p = ts.point(th, 1.0, new Vector3());
    const n = surfaceNormal(ts, th, 1.0, new Vector3());
    const at = (lift: number, up: number) => p.clone().addScaledVector(n, lift).addScaledVector(Y, up);
    g.add(`pouch.${th.toFixed(2)}`, 'hips', 'soft', roundedBox(0.062, 0.07, 0.034, 0.009, S.strap, frame(at(0.021, 0), n)));
    g.add(`pouch.flap.${th.toFixed(2)}`, 'hips', 'soft', roundedBox(0.066, 0.03, 0.007, 0.003, S.panel, frame(at(0.039, 0.021), n)));
    g.rivetAt('hips', at(0.043, 0.018), n);
  }
}

// ── Legs: knee pads, cargo pockets, thigh straps ──

function legGear(g: GearSet, side: Side): void {
  const sg = sideSign(side);
  const ls = sectionSurface(legSections(side));
  const lat = side === 'L' ? 0 : Math.PI;
  const inner = side === 'L' ? Math.PI : 0;
  const shin: BoneName = `shin.${side}`, thigh: BoneName = `thigh.${side}`;
  const pad = { color: S.panel, edge: S.strap, res: 0.02 };
  g.add(`knee.upper.${side}`, shin, 'soft', plate(ls, FRONT - 0.72, FRONT + 0.72, 0.535, 0.648, { gap: 0.006, thick: 0.017, bevel: 0.008, ...pad }));
  g.add(`knee.lower.${side}`, shin, 'soft', plate(ls, FRONT - 0.62, FRONT + 0.62, 0.498, 0.548, { gap: 0.004, thick: 0.012, bevel: 0.006, ...pad }));
  for (const d of [-0.45, 0.45]) g.rivetOn(shin, ls, FRONT + d, 0.59, 0.023);

  // Cargo pocket on the outer front of the thigh, with a flap and a snap
  const pc = lat + sg * 0.3;
  const fab = { color: S.fabricDark, edge: S.panel, wall: S.panel, res: 0.022 };
  g.add(`pocket.${side}`, thigh, 'soft', plate(ls, pc - 0.5, pc + 0.5, 0.655, 0.775, { gap: 0.003, thick: 0.018, ...fab }));
  g.add(`pocket.flap.${side}`, thigh, 'soft', plate(ls, pc - 0.55, pc + 0.55, 0.745, 0.795, { gap: 0.021, thick: 0.007, ...fab }));
  g.rivetOn(thigh, ls, pc, 0.77, 0.028);

  // Thigh strap (open on the inner side, where the legs touch) with a brass buckle
  g.add(`thigh.strap.${side}`, thigh, 'soft', plate(ls, inner + 0.7, inner + TAU - 0.7, 0.818, 0.838, { gap: 0.003, thick: 0.007, color: S.strap, edge: S.panel, res: 0.035 }));
  const tb = lat + sg * 0.75;
  g.add(`thigh.buckle.${side}`, thigh, 'metal', plate(ls, tb - 0.13, tb + 0.13, 0.812, 0.844, { gap: 0.0105, thick: 0.005, color: S.brass, edge: S.copperHi, wall: S.copperDark, res: 0.02 }));
}

// ── Boots ──

/** Boot foot sections along Z: [z, half width, up, down, center height]. */
const FOOT: [number, number, number, number, number][] = [
  [-0.098, 0.044, 0.052, 0.045, 0.09],
  [-0.075, 0.054, 0.072, 0.05, 0.092],
  [-0.035, 0.058, 0.076, 0.054, 0.093],
  [0.01, 0.058, 0.07, 0.054, 0.09],
  [0.06, 0.06, 0.05, 0.046, 0.083],
  [0.11, 0.062, 0.04, 0.042, 0.077],
  [0.155, 0.06, 0.034, 0.038, 0.073],
  [0.19, 0.054, 0.03, 0.035, 0.07],
  [0.205, 0.046, 0.026, 0.032, 0.068]
];

/** Sole outline: [z, half width] from heel to toe. */
const SOLE: [number, number][] = [
  [-0.112, 0.024], [-0.105, 0.042], [-0.085, 0.051], [-0.04, 0.056], [0.02, 0.06],
  [0.08, 0.066], [0.14, 0.066], [0.185, 0.058], [0.208, 0.044], [0.22, 0.022]
];

/** Sole outline in the extrusion plane: shape x = world x, shape y = world z. */
function soleShape(x: number, grow: number): Shape {
  const pts = [
    ...SOLE.map(([z, w]) => [x + w + grow, z] as const),
    ...[...SOLE].reverse().map(([z, w]) => [x - w - grow, z] as const)
  ];
  const s = new Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [px, pz] of pts.slice(1)) s.lineTo(px, pz);
  s.closePath();
  return s;
}

function boot(g: GearSet, side: Side): void {
  const sg = sideSign(side);
  const secs = legSections(side);
  const ls = sectionSurface(secs);
  const sh = sectionShape(secs);
  const shin: BoneName = `shin.${side}`, foot: BoneName = `foot.${side}`;
  const x = bindPosition(`foot.${side}`).x;
  const D = S.copperDark, C = S.copper, H = S.copperHi;
  const cu = { color: C, edge: H, wall: D, res: 0.022 };

  // Shaft: dark shell around the calf, flaring under the knee pad into a rolled top lip
  g.add(`boot.shaft.${side}`, shin, 'metal', ring(sh, [
    [[0.012, 0.16, D], [0.014, 0.44, D], [0.02, 0.497, D]],
    [[0.02, 0.497, H], [0.017, 0.503, C], [0.002, 0.503, D]]
  ], 22));
  // Ribbed shin guard wrapping the front and sides, calf plate behind
  const ribs: [number, number][] = [[0.407, 0.462], [0.346, 0.401], [0.285, 0.34], [0.224, 0.279], [0.17, 0.218]];
  ribs.forEach(([v0, v1], k) => g.add(`boot.rib${k}.${side}`, shin, 'metal', plate(ls, FRONT - 1.45, FRONT + 1.45, v0, v1, { gap: 0.014, thick: 0.012, ...cu, res: 0.03 })));
  g.add(`boot.calf.${side}`, shin, 'metal', plate(ls, BACK - 1.05, BACK + 1.05, 0.235, 0.44, { gap: 0.014, thick: 0.009, ...cu, res: 0.03 }));
  for (const k of [0, 2]) for (const d of [-1.2, 1.2]) g.rivetOn(shin, ls, FRONT + d, (ribs[k][0] + ribs[k][1]) / 2, 0.026);

  // Foot: heavy copper shell, toe cap, instep straps, ankle cuff
  const fsecs: Section[] = FOOT.map(([z, rx, up, dn, cy]) => ({ y: z, rx, zf: up, zb: dn, cz: cy, cx: x, n: 2.6 }));
  const fs = sectionSurface(fsecs, 'z');
  g.add(`boot.foot.${side}`, foot, 'metal', loft(fsecs, 'z', { color: D, res: 0.03, radial: 16, capLo: 0.014, capHi: 0.014 }));
  g.add(`boot.toe.${side}`, foot, 'metal', plate(fs, FRONT - 1.4, FRONT + 1.4, 0.1, 0.203, { gap: 0.002, thick: 0.01, ...cu }));
  g.add(`boot.heel.${side}`, foot, 'metal', plate(fs, FRONT - 1.5, FRONT + 1.5, -0.098, -0.05, { gap: 0.002, thick: 0.008, ...cu }));
  for (const [v0, v1] of [[-0.012, 0.022], [0.04, 0.07]]) {
    g.add(`boot.strap${v0}.${side}`, foot, 'soft', plate(fs, FRONT - 1.5, FRONT + 1.5, v0, v1, { gap: 0.002, thick: 0.007, color: S.strap, edge: S.panel, res: 0.022 }));
  }
  const fb = side === 'L' ? 0.35 : Math.PI - 0.35;
  g.add(`boot.buckle.${side}`, foot, 'metal', plate(fs, fb - 0.22, fb + 0.22, -0.016, 0.026, { gap: 0.009, thick: 0.005, color: S.brass, edge: H, wall: D, res: 0.02 }));
  g.add(`boot.cuff.${side}`, foot, 'soft', ring(sh, [
    [[0.018, 0.12, S.strap], [0.021, 0.198, S.strap]],
    [[0.021, 0.198, S.panel], [0.013, 0.203, S.panel]]
  ], 20));
  const cp = sh(side === 'L' ? 0 : Math.PI, 0.16, 0.021, new Vector3());
  g.add(`boot.cuff.buckle.${side}`, foot, 'metal', roundedBox(0.008, 0.03, 0.026, 0.003, S.brass, new Matrix4().makeTranslation(cp.x + sg * 0.003, cp.y, cp.z)));

  // Sole: black midsole over a rubber outsole, beveled; ~0.34 m heel to toe
  const rot = new Matrix4().makeRotationX(Math.PI / 2);
  g.add(`boot.midsole.${side}`, foot, 'soft', extrude(soleShape(x, 0.002), 0.008, 0.004, S.panel, new Matrix4().makeTranslation(0, 0.036, 0).multiply(rot)));
  g.add(`boot.outsole.${side}`, foot, 'soft', extrude(soleShape(x, 0.003), 0.018, 0.003, S.strap, new Matrix4().makeTranslation(0, 0.021, 0).multiply(rot)));
}

// ── RIG mounts (provisional until phase 5 rebuilds the RIG) ──

function rigMounts(g: GearSet, weaponSide: Side): void {
  const ws = sideSign(weaponSide);
  const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
  g.add('rig.housing', 'spine2', 'metal', roundedBox(0.085, 0.42, 0.026, 0.008, S.copperDark, at(0, 1.27, -0.12),));
  g.add('rig.pack', 'spine2', 'metal', roundedBox(0.1, 0.08, 0.06, 0.012, S.copperDark, at(0, 1.475, -0.115),));
  g.add('rig.stasisPlate', 'spine2', 'metal', roundedBox(0.13, 0.15, 0.04, 0.01, S.copperDark, at(ws * 0.12, 1.38, -0.125),));
}

// ── Assembly ──

/** Rigid skinned geometry: every vertex follows one bone with weight 1. */
function skinnedGeometry(parts: { chunk: Chunk; bone: BoneName }[]): BufferGeometry {
  const all = new Chunk();
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  for (const p of parts) {
    all.append(p.chunk);
    for (let i = 0; i < p.chunk.vertexCount; i++) {
      skinIndex.push(BONE_INDEX[p.bone], 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
  }
  const g = chunkGeometry(all);
  g.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
  return g;
}

/** Glove geometry: relaxed base for both hands plus grip/open morph targets per hand. */
function glovesGeometry(): { geometry: BufferGeometry; tips: Record<Side, number[]>; relaxed: Record<Side, Chunk> } {
  const L = buildGlove('L'), R = buildGlove('R');
  const geometry = skinnedGeometry([{ chunk: L.poses.relaxed, bone: 'hand.L' }, { chunk: R.poses.relaxed, bone: 'hand.R' }]);
  const n = L.poses.relaxed.vertexCount + R.poses.relaxed.vertexCount;
  const morph = (hand: typeof L, offset: number, pose: 'grip' | 'open', attr: 'pos' | 'nrm') => {
    const d = new Float32Array(n * 3);
    const base = hand.poses.relaxed[attr], target = hand.poses[pose][attr];
    for (let i = 0; i < base.length; i++) d[offset * 3 + i] = target[i] - base[i];
    return new Float32BufferAttribute(d, 3);
  };
  const nL = L.poses.relaxed.vertexCount;
  const targets = GLOVE_MORPHS.map(name => {
    const [pose, side] = name.split('.') as ['grip' | 'open', Side];
    return { hand: side === 'L' ? L : R, offset: side === 'L' ? 0 : nL, pose };
  });
  geometry.morphAttributes.position = targets.map(t => morph(t.hand, t.offset, t.pose, 'pos'));
  geometry.morphAttributes.normal = targets.map(t => morph(t.hand, t.offset, t.pose, 'nrm'));
  geometry.morphTargetsRelative = true;
  return { geometry, tips: { L: L.tips, R: R.tips.map(i => i + nL) }, relaxed: { L: L.poses.relaxed, R: R.poses.relaxed } };
}

/** Rivets as one InstancedMesh; instances follow their bones (see `update`). */
export class RivetSet {
  readonly mesh: InstancedMesh;
  readonly defs: RivetDef[];
  private readonly boneIdx: number[];
  /** Rivet transform relative to its bone's bind frame. */
  private readonly offsets: Matrix4[];
  private readonly boneModel = BONE_DEFS.map(() => new Matrix4());
  private readonly tmp = new Matrix4();

  constructor(defs: RivetDef[], material: Material) {
    this.defs = defs;
    this.mesh = new InstancedMesh(rivetGeometry(RIVET_RADIUS, 0.003, S.brass), material, defs.length);
    this.mesh.name = 'isaac-rivets';
    this.mesh.frustumCulled = false;
    this.boneIdx = defs.map(d => BONE_INDEX[d.bone]);
    this.offsets = defs.map(d => {
      const b = bindPosition(d.bone);
      return new Matrix4().makeTranslation(-b.x, -b.y, -b.z).multiply(d.matrix);
    });
  }

  /** Recomputes instance matrices from the bones' local transforms (model space, no world matrices). */
  update(bones: IsaacBones): void {
    BONE_DEFS.forEach((def, k) => {
      const b = bones.bone[def.name];
      b.updateMatrix();
      if (def.parent) this.boneModel[k].multiplyMatrices(this.boneModel[BONE_INDEX[def.parent]], b.matrix);
      else this.boneModel[k].copy(b.matrix);
    });
    for (let i = 0; i < this.offsets.length; i++) {
      this.mesh.setMatrixAt(i, this.tmp.multiplyMatrices(this.boneModel[this.boneIdx[i]], this.offsets[i]));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export interface IsaacGear {
  metal: SkinnedMesh;
  soft: SkinnedMesh;
  visor: SkinnedMesh;
  gloves: SkinnedMesh;
  rivets: RivetSet;
  /** Every rigid piece (bind pose), for the numeric checks. */
  pieces: GearPiece[];
  /** Fingertip vertex indices in the gloves geometry (index..pinky, thumb). */
  gloveTips: Record<Side, number[]>;
}

export const GEAR_MATERIAL_PARAMS = {
  metal: { roughness: 0.6, metalness: 0.4 },
  soft: { roughness: 0.78, metalness: 0 }
} as const;

export function buildGear(weaponSide: Side): IsaacGear {
  const g = new GearSet();
  helmet(g);
  collar(g);
  chest(g);
  belt(g);
  for (const side of ['L', 'R'] as Side[]) {
    shoulder(g, side);
    bracer(g, side);
    legGear(g, side);
    boot(g, side);
  }
  rigMounts(g, weaponSide);

  const metalMat = new MeshStandardMaterial({ vertexColors: true, ...GEAR_MATERIAL_PARAMS.metal });
  const softMat = new MeshStandardMaterial({ vertexColors: true, ...GEAR_MATERIAL_PARAMS.soft });
  const visorMat = new MeshBasicMaterial({ vertexColors: true });
  const mesh = (cls: GearClass, material: Material) => {
    const m = new SkinnedMesh(skinnedGeometry(g.pieces.filter(p => p.cls === cls)), material);
    m.name = `isaac-gear-${cls}`;
    m.frustumCulled = false;
    m.castShadow = false;
    return m;
  };

  const gl = glovesGeometry();
  const gloves = new SkinnedMesh(gl.geometry, softMat);
  gloves.name = 'isaac-gloves';
  gloves.frustumCulled = false;
  gloves.castShadow = false;
  const pieces = [...g.pieces, { name: 'glove.L', bone: 'hand.L', cls: 'soft', chunk: gl.relaxed.L } as GearPiece, { name: 'glove.R', bone: 'hand.R', cls: 'soft', chunk: gl.relaxed.R } as GearPiece];

  return {
    metal: mesh('metal', metalMat),
    soft: mesh('soft', softMat),
    visor: mesh('visor', visorMat),
    gloves,
    rivets: new RivetSet(g.rivets, metalMat),
    pieces,
    gloveTips: gl.tips
  };
}
