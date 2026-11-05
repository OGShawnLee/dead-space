import {
  Box3,
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Vector2,
  Vector3,
  type Shape
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sampleSection, type Section } from './IsaacBody';

/**
 * Geometry toolkit for Isaac's rigid gear (Proposal 005, 5.3). Every builder returns a
 * `Chunk` in model-space bind coordinates with per-vertex colors, so pieces of one
 * material class merge into a single skinned mesh (one draw call) whatever the bone.
 *
 * - `plate`: a thick plate with chamfered, edge-worn rims lying on any `Surface`
 *   (the body lofts, so armor fits the body by construction, or a superellipsoid).
 * - `ring`: a profile revolved around a limb or an ellipse (bands, ribs, cuffs, collar).
 * - `loft`: a closed tube with domed ends along Y or Z (palm, boot foot).
 * - `tube`: a tapered tube through points (fingers, cables).
 * - `roundedBox`, `extrude`: wrappers that add colors and a placement matrix.
 */

const tmpColor = new Color();
const va = new Vector3(), vb = new Vector3(), vc = new Vector3();

export class Chunk {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  get vertexCount(): number { return this.pos.length / 3; }
  get triangleCount(): number { return this.idx.length / 3; }

  vertex(p: Vector3, color: number, u = 0, v = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(0, 0, 0);
    tmpColor.setHex(color);
    this.col.push(tmpColor.r, tmpColor.g, tmpColor.b);
    this.uv.push(u, v);
    return this.vertexCount - 1;
  }

  tri(a: number, b: number, c: number, flip = false): void {
    if (flip) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  /** Quad a-b-c-d (in order around its edge). */
  quad(a: number, b: number, c: number, d: number, flip = false): void {
    this.tri(a, b, c, flip);
    this.tri(a, c, d, flip);
  }

  point(i: number, out: Vector3): Vector3 {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  /** Normal of the triangle a-b-c (not normalized). */
  faceNormal(a: number, b: number, c: number, out: Vector3): Vector3 {
    this.point(a, va); this.point(b, vb); this.point(c, vc);
    return out.subVectors(vb, va).cross(vc.sub(va));
  }

  /** True if quad a-b-c-d, wound as given, faces away from `outward`. */
  facesAgainst(a: number, b: number, c: number, d: number, outward: Vector3): boolean {
    const n = this.faceNormal(a, b, c, new Vector3());
    if (n.lengthSq() < 1e-16) this.faceNormal(a, c, d, n);
    return n.dot(outward) < 0;
  }

  /** Smooth area-weighted normals for vertices from `v0`, using the triangles from `i0`. */
  smooth(v0: number, i0: number, fallback?: (i: number, out: Vector3) => Vector3): void {
    const n = new Vector3();
    for (let i = v0 * 3; i < this.nrm.length; i++) this.nrm[i] = 0;
    for (let t = i0; t < this.idx.length; t += 3) {
      const a = this.idx[t], b = this.idx[t + 1], c = this.idx[t + 2];
      this.faceNormal(a, b, c, n);
      for (const k of [a, b, c]) {
        if (k < v0) continue;
        this.nrm[k * 3] += n.x; this.nrm[k * 3 + 1] += n.y; this.nrm[k * 3 + 2] += n.z;
      }
    }
    for (let k = v0; k < this.vertexCount; k++) {
      n.set(this.nrm[k * 3], this.nrm[k * 3 + 1], this.nrm[k * 3 + 2]);
      if (n.lengthSq() < 1e-20) {
        if (fallback) fallback(k, n);
        else n.set(0, 1, 0);
      }
      n.normalize();
      this.nrm[k * 3] = n.x; this.nrm[k * 3 + 1] = n.y; this.nrm[k * 3 + 2] = n.z;
    }
  }

  append(o: Chunk): this {
    const base = this.vertexCount;
    // Loops, not spread: merged chunks can exceed the engine's argument limit
    for (const v of o.pos) this.pos.push(v);
    for (const v of o.nrm) this.nrm.push(v);
    for (const v of o.col) this.col.push(v);
    for (const v of o.uv) this.uv.push(v);
    for (const i of o.idx) this.idx.push(i + base);
    return this;
  }

  transform(m: Matrix4): this {
    const nm = new Matrix3().getNormalMatrix(m);
    const p = new Vector3();
    for (let i = 0; i < this.vertexCount; i++) {
      p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(m);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      p.set(this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]).applyMatrix3(nm).normalize();
      this.nrm[i * 3] = p.x; this.nrm[i * 3 + 1] = p.y; this.nrm[i * 3 + 2] = p.z;
    }
    return this;
  }

  bounds(): Box3 {
    const b = new Box3();
    const p = new Vector3();
    for (let i = 0; i < this.vertexCount; i++) b.expandByPoint(this.point(i, p));
    return b;
  }

  static fromGeometry(g: BufferGeometry, color: number, m?: Matrix4): Chunk {
    const c = new Chunk();
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const p = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      c.vertex(p.fromBufferAttribute(pos, i), color, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      c.nrm[i * 3] = nrm.getX(i); c.nrm[i * 3 + 1] = nrm.getY(i); c.nrm[i * 3 + 2] = nrm.getZ(i);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) c.idx.push(g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) c.idx.push(i);
    g.dispose();
    return m ? c.transform(m) : c;
  }
}

/** Merges chunks into one indexed geometry (position, normal, color, uv). */
export function chunkGeometry(chunk: Chunk): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(chunk.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(chunk.nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(chunk.col, 3));
  g.setAttribute('uv', new Float32BufferAttribute(chunk.uv, 2));
  g.setIndex(chunk.idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ── Surfaces ──

/** A parametric surface with a point inside the solid (to orient normals outward). */
export interface Surface {
  point(u: number, v: number, out: Vector3): Vector3;
  inside(u: number, v: number, out: Vector3): Vector3;
}

const EPS = 1e-4;
const s1 = new Vector3(), s2 = new Vector3(), s3 = new Vector3(), s4 = new Vector3(), s5 = new Vector3(), s6 = new Vector3();

/** Outward unit normal of a surface (numeric; falls back to the radial direction at poles). */
export function surfaceNormal(s: Surface, u: number, v: number, out: Vector3): Vector3 {
  s.point(u + EPS, v, s1).sub(s.point(u - EPS, v, s2));
  s.point(u, v + EPS, s3).sub(s.point(u, v - EPS, s4));
  out.crossVectors(s1, s3);
  const radial = s.point(u, v, s5).sub(s.inside(u, v, s6));
  if (out.lengthSq() < 1e-16) out.copy(radial);
  out.normalize();
  if (out.dot(radial) < 0) out.negate();
  return out;
}

const sgnPow = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);

/**
 * Surface of a section loft (the body's own sections). `u` = angle (0 = +X, PI/2 = front
 * or up), `v` = height (axis y) or depth (axis z). For axis z the section fields map as:
 * `rx` half width, `zf`/`zb` up/down extent, `cz` center height.
 */
export function sectionSurface(sections: Section[], axis: 'y' | 'z' = 'y'): Surface {
  const sorted = [...sections].sort((a, b) => a.y - b.y);
  return {
    point(u, v, out) {
      const s = sampleSection(sorted, v);
      const e = 2 / s.n;
      const c = Math.cos(u), si = Math.sin(u);
      const a = s.rx * sgnPow(c, e);
      const b = (si >= 0 ? s.zf : s.zb) * sgnPow(si, e);
      return axis === 'y' ? out.set(s.cx + a, v, s.cz + b) : out.set(s.cx + a, s.cz + b, v);
    },
    inside(_u, v, out) {
      const s = sampleSection(sorted, v);
      return axis === 'y' ? out.set(s.cx, v, s.cz) : out.set(s.cx, s.cz, v);
    }
  };
}

export interface Radii { x: number; up: number; down: number; front: number; back: number }

/**
 * Superellipsoid around `center`, parametrized by a direction function, so plates can be
 * laid out in whatever angular frame suits them (spherical, sagittal, lateral).
 */
export function radialSurface(center: Vector3, r: Radii, n: number, dir: (u: number, v: number, out: Vector3) => Vector3): Surface {
  const d = new Vector3();
  return {
    point(u, v, out) {
      dir(u, v, d);
      const sum = Math.pow(Math.abs(d.x) / r.x, n)
        + Math.pow(Math.abs(d.y) / (d.y >= 0 ? r.up : r.down), n)
        + Math.pow(Math.abs(d.z) / (d.z >= 0 ? r.front : r.back), n);
      return out.copy(center).addScaledVector(d, Math.pow(sum, -1 / n));
    },
    inside: (_u, _v, out) => out.copy(center)
  };
}

/** Spherical frame: u = azimuth from +Z toward +X, v = elevation. */
export const sph = (u: number, v: number, out: Vector3): Vector3 =>
  out.set(Math.cos(v) * Math.sin(u), Math.sin(v), Math.cos(v) * Math.cos(u));

/** Sagittal frame: u = angle from +Z up over the top to -Z, v = lateral angle toward +X. */
export const sag = (u: number, v: number, out: Vector3): Vector3 =>
  out.set(Math.sin(v), Math.cos(v) * Math.sin(u), Math.cos(v) * Math.cos(u));

/** Lateral frame for a side (sg = +1 left): u = angle from the side toward the front, v = elevation. */
export const lateral = (sg: number) => (u: number, v: number, out: Vector3): Vector3 =>
  out.set(sg * Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));

// ── Plate ──

export interface PlateOpts {
  /** Clearance between the surface and the plate's underside. */
  gap?: number;
  thick: number;
  color: number;
  /** Rim color (worn edge highlight); defaults to `color`. */
  edge?: number;
  /** Side wall color; defaults to `edge`. */
  wall?: number;
  /** Chamfer width in meters. */
  bevel?: number;
  /** Target segment length in meters. */
  res?: number;
  closedU?: boolean;
  /** Also build the underside (visible from below or inside). */
  inner?: boolean;
  walls?: boolean;
}

function arcLength(s: Surface, a: number, b: number, fixed: number, alongU: boolean): number {
  let len = 0;
  const p = new Vector3(), q = new Vector3();
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = a + ((b - a) * i) / N;
    if (alongU) s.point(t, fixed, q); else s.point(fixed, t, q);
    if (i) len += q.distanceTo(p);
    p.copy(q);
  }
  return len;
}

/** Parameter samples with a chamfer row near each end. */
function withBevel(a: number, b: number, n: number, d: number): number[] {
  d = Math.min(d, (b - a) * 0.25);
  const out = [a];
  for (let i = 0; i <= n; i++) out.push(a + d + ((b - a - 2 * d) * i) / n);
  out.push(b);
  return out;
}

/** Height of the rim relative to the full thickness (the rest is the chamfer slope). */
const RIM = 0.4;

/**
 * Thick plate over the surface patch [u0,u1] x [v0,v1]: chamfered top whose rim takes
 * the `edge` color (edge wear), side walls down to the surface, optional underside.
 */
export function plate(s: Surface, u0: number, u1: number, v0: number, v1: number, o: PlateOpts): Chunk {
  const c = new Chunk();
  const gap = o.gap ?? 0.003;
  const bevel = o.bevel ?? Math.min(0.005, o.thick * 0.6);
  const res = o.res ?? 0.02;
  const edge = o.edge ?? o.color;
  const wall = o.wall ?? edge;
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const lenU = arcLength(s, u0, u1, vm, true), lenV = arcLength(s, v0, v1, um, false);
  const nu = Math.max(1, Math.round(lenU / res)), nv = Math.max(1, Math.round(lenV / res));
  const us = o.closedU
    ? Array.from({ length: Math.max(8, nu) }, (_, i) => u0 + ((u1 - u0) * i) / Math.max(8, nu))
    : withBevel(u0, u1, nu, (bevel / lenU) * (u1 - u0));
  const vs = withBevel(v0, v1, nv, (bevel / lenV) * (v1 - v0));
  const I = us.length, J = vs.length;

  const base: Vector3[][] = [], nrm: Vector3[][] = [];
  for (let i = 0; i < I; i++) {
    base.push([]); nrm.push([]);
    for (let j = 0; j < J; j++) {
      base[i].push(s.point(us[i], vs[j], new Vector3()));
      nrm[i].push(surfaceNormal(s, us[i], vs[j], new Vector3()));
    }
  }
  const rim = (i: number, j: number) => j === 0 || j === J - 1 || (!o.closedU && (i === 0 || i === I - 1));
  const at = (i: number, j: number, h: number) => base[i][j].clone().addScaledVector(nrm[i][j], gap + h);

  // Top surface
  const v0i = c.vertexCount, i0 = c.idx.length;
  const top: number[][] = [];
  for (let i = 0; i < I; i++) {
    top.push([]);
    for (let j = 0; j < J; j++) {
      const r = rim(i, j);
      top[i].push(c.vertex(at(i, j, o.thick * (r ? RIM : 1)), r ? edge : o.color, i / (I - 1), j / (J - 1)));
    }
  }
  const iMax = o.closedU ? I : I - 1;
  const ci = Math.floor(iMax / 2), cj = Math.floor((J - 1) / 2);
  const flip = c.facesAgainst(top[ci][cj], top[(ci + 1) % I][cj], top[(ci + 1) % I][cj + 1], top[ci][cj + 1], nrm[ci][cj]);
  for (let i = 0; i < iMax; i++) {
    for (let j = 0; j < J - 1; j++) c.quad(top[i][j], top[(i + 1) % I][j], top[(i + 1) % I][j + 1], top[i][j + 1], flip);
  }
  c.smooth(v0i, i0);

  // Side walls, one strip per open edge, facing away from the plate
  if (o.walls !== false) {
    const edges: { cells: [number, number][]; out: (i: number, j: number) => Vector3 }[] = [];
    const tangent = (i: number, j: number, alongU: boolean, sign: number) => {
      const a = alongU ? s.point(us[i] + EPS, vs[j], new Vector3()) : s.point(us[i], vs[j] + EPS, new Vector3());
      const b = alongU ? s.point(us[i] - EPS, vs[j], new Vector3()) : s.point(us[i], vs[j] - EPS, new Vector3());
      return a.sub(b).multiplyScalar(sign);
    };
    const row = (j: number) => Array.from({ length: o.closedU ? I + 1 : I }, (_, i) => [i % I, j] as [number, number]);
    const col = (i: number) => Array.from({ length: J }, (_, j) => [i, j] as [number, number]);
    edges.push({ cells: row(0), out: (i, j) => tangent(i, j, false, -1) });
    edges.push({ cells: row(J - 1), out: (i, j) => tangent(i, j, false, 1) });
    if (!o.closedU) {
      edges.push({ cells: col(0), out: (i, j) => tangent(i, j, true, -1) });
      edges.push({ cells: col(I - 1), out: (i, j) => tangent(i, j, true, 1) });
    }
    for (const e of edges) {
      const w0 = c.vertexCount, wi = c.idx.length;
      const up: number[] = [], dn: number[] = [];
      for (const [i, j] of e.cells) {
        up.push(c.vertex(at(i, j, o.thick * RIM), wall));
        dn.push(c.vertex(at(i, j, 0), wall));
      }
      const m = Math.floor(e.cells.length / 2) - 1;
      const [mi, mj] = e.cells[Math.max(0, m)];
      const wflip = c.facesAgainst(up[Math.max(0, m)], up[Math.max(0, m) + 1], dn[Math.max(0, m) + 1], dn[Math.max(0, m)], e.out(mi, mj));
      for (let k = 0; k < e.cells.length - 1; k++) c.quad(up[k], up[k + 1], dn[k + 1], dn[k], wflip);
      c.smooth(w0, wi);
    }
  }

  // Underside
  if (o.inner) {
    const b0 = c.vertexCount, bi = c.idx.length;
    const bot: number[][] = [];
    for (let i = 0; i < I; i++) {
      bot.push([]);
      for (let j = 0; j < J; j++) bot[i].push(c.vertex(at(i, j, 0), wall));
    }
    for (let i = 0; i < iMax; i++) {
      for (let j = 0; j < J - 1; j++) c.quad(bot[i][j], bot[(i + 1) % I][j], bot[(i + 1) % I][j + 1], bot[i][j + 1], !flip);
    }
    c.smooth(b0, bi);
  }
  return c;
}

// ── Ring (revolved profile) ──

/** Point at angle `theta`, height `t`, `off` meters out from the shape's base. */
export type RingShape = (theta: number, t: number, off: number, out: Vector3) => Vector3;

/** Ellipse around a vertical axis; `off` is the radius (scaled per axis). */
export const ellipseShape = (cx: number, cz: number, sx = 1, szFront = 1, szBack = 1): RingShape =>
  (th, t, off, out) => {
    const si = Math.sin(th);
    return out.set(cx + off * sx * Math.cos(th), t, cz + off * (si >= 0 ? szFront : szBack) * si);
  };

/** A limb or torso surface; `off` pushes out radially from the surface. */
export function sectionShape(sections: Section[]): RingShape {
  const surf = sectionSurface(sections);
  const p = new Vector3(), q = new Vector3();
  return (th, t, off, out) => {
    surf.point(th, t, p);
    surf.inside(th, t, q);
    const dx = p.x - q.x, dz = p.z - q.z;
    const len = Math.hypot(dx, dz) || 1;
    return out.set(p.x + (dx / len) * off, t, p.z + (dz / len) * off);
  };
}

/** Profile point: [offset, height, color]. */
export type ProfilePoint = [number, number, number];

/**
 * Revolves profile strips around the shape. Each strip is smooth; corners between strips
 * stay crisp. Strips should run counterclockwise in the (offset, height) plane (solid on
 * the left), so faces point to the right of travel.
 */
export function ring(shape: RingShape, strips: ProfilePoint[][], segs: number, th0 = 0, th1 = Math.PI * 2): Chunk {
  const c = new Chunk();
  const closed = Math.abs(th1 - th0 - Math.PI * 2) < 1e-6;
  const n = closed ? segs : segs + 1;
  const ths = Array.from({ length: n }, (_, i) => th0 + ((th1 - th0) * i) / segs);
  const p = new Vector3(), q = new Vector3();
  for (const strip of strips) {
    const v0 = c.vertexCount, i0 = c.idx.length;
    const rows = strip.map(([off, t, color], k) =>
      ths.map((th, i) => c.vertex(shape(th, t, off, p), color, i / segs, k / Math.max(1, strip.length - 1)))
    );
    // Outward = right of travel in the profile plane
    const [o0, t0] = strip[0], [o1, t1] = strip[1];
    const radial = shape(ths[0], t0, o0 + 0.01, q).sub(shape(ths[0], t0, o0, p)).normalize();
    const outward = radial.multiplyScalar(t1 - t0).add(new Vector3(0, -(o1 - o0), 0));
    const flip = c.facesAgainst(rows[0][0], rows[0][1], rows[1][1], rows[1][0], outward);
    for (let k = 0; k < strip.length - 1; k++) {
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const i1 = (i + 1) % n;
        c.quad(rows[k][i], rows[k][i1], rows[k + 1][i1], rows[k + 1][i], flip);
      }
    }
    c.smooth(v0, i0);
  }
  return c;
}

// ── Loft (closed tube with domed ends) ──

export interface LoftOpts {
  color: number | ((p: Vector3, theta: number, t: number) => number);
  res?: number;
  radial?: number;
  capLo?: number;
  capHi?: number;
}

export function loft(sections: Section[], axis: 'y' | 'z', o: LoftOpts): Chunk {
  const c = new Chunk();
  const surf = sectionSurface(sections, axis);
  const sorted = [...sections].sort((a, b) => a.y - b.y);
  const lo = sorted[0].y, hi = sorted[sorted.length - 1].y;
  const res = o.res ?? 0.02, R = o.radial ?? 16;
  const rings: { t: number; scale: number; dt: number }[] = [];
  const capRings = (h: number) => (h > 0 ? Math.max(2, Math.round(h / (res * 0.6)) + 1) : 0);
  const kLo = capRings(o.capLo ?? 0), kHi = capRings(o.capHi ?? 0);
  for (let k = 0; k < kLo; k++) {
    const phi = (1 - k / kLo) * (Math.PI / 2);
    rings.push({ t: lo, scale: Math.cos(phi), dt: -Math.sin(phi) * (o.capLo ?? 0) });
  }
  const count = Math.max(2, Math.ceil((hi - lo) / res));
  for (let i = 0; i <= count; i++) rings.push({ t: lo + ((hi - lo) * i) / count, scale: 1, dt: 0 });
  for (let k = kHi - 1; k >= 0; k--) {
    const phi = (1 - k / kHi) * (Math.PI / 2);
    rings.push({ t: hi, scale: Math.cos(phi), dt: Math.sin(phi) * (o.capHi ?? 0) });
  }
  const axisDir = axis === 'y' ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const p = new Vector3(), ctr = new Vector3();
  const grid = rings.map(({ t, scale, dt }, k) =>
    Array.from({ length: R }, (_, i) => {
      const th = (i / R) * Math.PI * 2;
      surf.point(th, t, p);
      surf.inside(th, t, ctr);
      p.sub(ctr).multiplyScalar(scale).add(ctr).addScaledVector(axisDir, dt);
      const color = typeof o.color === 'number' ? o.color : o.color(p, th, t + dt);
      return c.vertex(p, color, i / R, k / (rings.length - 1));
    })
  );
  const flip = c.facesAgainst(grid[kLo + 1][0], grid[kLo + 1][1], grid[kLo + 2][1], grid[kLo + 2][0],
    c.point(grid[kLo + 1][0], new Vector3()).sub(surf.inside(0, rings[kLo + 1].t, new Vector3())));
  for (let k = 0; k < grid.length - 1; k++) {
    for (let i = 0; i < R; i++) c.quad(grid[k][i], grid[k][(i + 1) % R], grid[k + 1][(i + 1) % R], grid[k + 1][i], flip);
  }
  c.smooth(0, 0, (k, out) => (k < c.vertexCount / 2 ? out.copy(axisDir).negate() : out.copy(axisDir)));
  return c;
}

// ── Tube ──

/**
 * Tapered tube through `pts` (radii per point), optional domed end cap. `axis` is a
 * reference direction roughly perpendicular to the tube; it fixes the ring orientation,
 * so tubes built from different poses share the same vertex layout.
 */
export function tube(pts: Vector3[], radii: number[], radial: number, color: number, axis: Vector3, capEnd = true): Chunk {
  const c = new Chunk();
  const rings: { center: Vector3; dir: Vector3; r: number }[] = pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    return { center: p, dir: b.clone().sub(a).normalize(), r: radii[k] };
  });
  if (capEnd) {
    const last = rings[rings.length - 1];
    for (const psi of [Math.PI / 5, (2 * Math.PI) / 5]) {
      rings.push({ center: last.center.clone().addScaledVector(last.dir, last.r * Math.sin(psi)), dir: last.dir, r: last.r * Math.cos(psi) });
    }
  }
  const A = new Vector3(), B = new Vector3(), p = new Vector3();
  const ids = rings.map((rg, k) => {
    A.copy(axis).addScaledVector(rg.dir, -axis.dot(rg.dir)).normalize();
    B.crossVectors(rg.dir, A);
    return Array.from({ length: radial }, (_, i) => {
      const ph = (i / radial) * Math.PI * 2;
      p.copy(rg.center).addScaledVector(A, Math.cos(ph) * rg.r).addScaledVector(B, Math.sin(ph) * rg.r);
      return c.vertex(p, color, i / radial, k / (rings.length - 1));
    });
  });
  const outward = c.point(ids[0][0], new Vector3()).sub(rings[0].center);
  const flip = c.facesAgainst(ids[0][0], ids[0][1], ids[1][1], ids[1][0], outward);
  for (let k = 0; k < ids.length - 1; k++) {
    for (let i = 0; i < radial; i++) c.quad(ids[k][i], ids[k][(i + 1) % radial], ids[k + 1][(i + 1) % radial], ids[k + 1][i], flip);
  }
  if (capEnd) {
    const last = rings[rings.length - 1];
    const tip = c.vertex(last.center.clone().addScaledVector(last.dir, last.r * 0.75), color, 0.5, 1);
    const l = ids[ids.length - 1];
    for (let i = 0; i < radial; i++) c.tri(l[i], l[(i + 1) % radial], tip, flip);
  }
  c.smooth(0, 0);
  return c;
}

// ── Wrappers ──

/** Basis with +Z along `normal` and +Y as close as possible to `up`, at `pos`. */
export function frame(pos: Vector3, normal: Vector3, up = new Vector3(0, 1, 0)): Matrix4 {
  const z = normal.clone().normalize();
  const y = up.clone().addScaledVector(z, -up.dot(z)).normalize();
  const x = new Vector3().crossVectors(y, z);
  return new Matrix4().makeBasis(x, y, z).setPosition(pos);
}

/** Rounded box; `segments` 1 is a single chamfer (108 triangles), 2 a rounder edge (300). */
export function roundedBox(w: number, h: number, d: number, radius: number, color: number, m: Matrix4, segments = 1): Chunk {
  return Chunk.fromGeometry(new RoundedBoxGeometry(w, h, d, segments, radius), color, m);
}

/** Beveled extrusion of a 2D shape along +Z (0..depth), then placed by `m`. */
export function extrude(shape: Shape, depth: number, bevel: number, color: number, m: Matrix4, curveSegments = 4): Chunk {
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments
  });
  g.computeVertexNormals();
  return Chunk.fromGeometry(g, color, m);
}

/** Small dome (rivet / bolt head) along +Y, radius r. */
export function rivetGeometry(r: number, h: number, color: number): BufferGeometry {
  const g = new LatheGeometry([new Vector2(0.0001, h), new Vector2(r * 0.8, h * 0.6), new Vector2(r, -h)], 6);
  const colors: number[] = [];
  tmpColor.setHex(color);
  for (let i = 0; i < g.attributes.position.count; i++) colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}
