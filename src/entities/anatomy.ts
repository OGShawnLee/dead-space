import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Mesh
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Organic geometry builders for the necromorphs. Pure geometry, no gameplay:
 * hitboxes stay the limb meshes tagged by each enemy class, so swapping a box
 * for one of these keeps dismemberment and AI untouched as long as the overall
 * size is similar. New enemy = compose these in its own `buildBody()`.
 */

/** Smooth, position-based noise: equal positions get equal values, so seams never crack. */
const wobble = (x: number, y: number, z: number, f: number, seed: number): number =>
  Math.sin(x * f + seed) * Math.sin(y * f * 1.31 + seed * 2.1) * Math.sin(z * f * 0.73 + seed * 3.7);

/** Displaces vertices along their normals with low-frequency noise (lumpy flesh). */
export function fleshify<T extends BufferGeometry>(geo: T, amp: number, freq = 4, seed = 0): T {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = wobble(x, y, z, freq, seed) * amp;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Tapered limb with a muscle bulge, centered on its length like the box it replaces. */
export function limb(length: number, rTop: number, rBottom: number, bulge = 0.25, seed = 0): BufferGeometry {
  const geo = new CylinderGeometry(rTop, rBottom, length, 8, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / length + 0.5;
    const k = 1 + bulge * Math.sin(Math.PI * t);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return fleshify(geo, 0.012, 9, seed);
}

/** Ribcage: narrow waist, broad shoulders. Fits the w/h/d box it replaces. */
export function torso(w: number, h: number, d: number, seed = 0): BufferGeometry {
  const profile = [
    [0.0, -0.5], [0.3, -0.48], [0.34, -0.3], [0.3, -0.1],
    [0.42, 0.15], [0.5, 0.3], [0.36, 0.46], [0.0, 0.5]
  ].map(([r, y]) => new Vector2(r, y));
  const geo = new LatheGeometry(profile, 14);
  geo.scale(w, h, d);
  return fleshify(geo, 0.02, 3, seed);
}

/** Lumpy ellipsoid body part (skull, belly, torso chunk). */
export function body(w: number, h: number, d: number, seed = 0): BufferGeometry {
  const geo = new SphereGeometry(0.5, 14, 10);
  geo.scale(w, h, d);
  return fleshify(geo, Math.min(w, h, d) * 0.06, 5, seed);
}

/** Skull: ellipsoid with a narrower jaw. */
export function head(w: number, h: number, d: number, seed = 0): BufferGeometry {
  const geo = new SphereGeometry(0.5, 14, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -0.05) {
      pos.setX(i, pos.getX(i) * 0.7);
      pos.setZ(i, pos.getZ(i) * 0.85);
    }
  }
  geo.scale(w, h, d);
  return fleshify(geo, Math.min(w, h, d) * 0.07, 6, seed);
}

/** Sac / pustule: bumpy sphere. */
export function lump(radius: number, seed = 0): BufferGeometry {
  return fleshify(new SphereGeometry(radius, 14, 10), radius * 0.25, 5, seed);
}

/** Scales each tube ring around the curve so it narrows (and optionally flattens) along its length. */
function taper(
  geo: TubeGeometry, curve: CatmullRomCurve3, tubular: number, radial: number,
  scaleAt: (t: number) => number, flatX = 1
): void {
  const pos = geo.attributes.position;
  const ring = radial + 1;
  const c = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.floor(i / ring) / tubular);
    curve.getPointAt(t, c);
    const s = scaleAt(t);
    pos.setXYZ(
      i,
      c.x + (pos.getX(i) - c.x) * s * flatX,
      c.y + (pos.getY(i) - c.y) * s,
      c.z + (pos.getZ(i) - c.z) * s
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Curved scythe blade along +Z (tip forward, curving up by `bend`), centered on its length. */
export function scythe(length: number, radius: number, bend = 0.25): BufferGeometry {
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, -length / 2),
    new Vector3(0, bend * length * 0.1, -length * 0.12),
    new Vector3(0, bend * length * 0.45, length * 0.2),
    new Vector3(0, bend * length, length / 2)
  ]);
  const geo = new TubeGeometry(curve, 14, radius, 4, false);
  taper(geo, curve, 14, 4, t => 1 - t * 0.96, 0.7);
  return geo;
}

/** Spinal tail curling up and over; returns the geometry and where it ends (for the stinger). */
export function tail(): { geometry: BufferGeometry; end: Vector3 } {
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0, 0.12, -0.45),
    new Vector3(0, 0.5, -0.85),
    new Vector3(0, 0.95, -0.9),
    new Vector3(0, 1.2, -0.6)
  ]);
  const geo = new TubeGeometry(curve, 18, 0.1, 6, false);
  taper(geo, curve, 18, 6, t => 1 - t * 0.55);
  fleshify(geo, 0.01, 9, 4);
  return { geometry: geo, end: curve.getPoint(1) };
}

const merge = (parts: BufferGeometry[]): BufferGeometry => {
  const merged = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  return merged;
};

/** Row of spikes along local Z pointing +Y, smaller toward the ends (dorsal ridge, ribs). */
export function spikeRow(n: number, spacing: number, r: number, h: number): BufferGeometry {
  const half = (n - 1) / 2;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const f = half === 0 ? 1 : 1 - 0.5 * Math.abs(i - half) / half;
    parts.push(new ConeGeometry(r * f, h * f, 5).translate(0, (h * f) / 2, (i - half) * spacing));
  }
  return merge(parts);
}

/** Row of fangs along local X pointing down (-Y). */
export function tuskRow(n: number, spacing: number, r: number, h: number): BufferGeometry {
  const half = (n - 1) / 2;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(new ConeGeometry(r, h, 5).rotateX(Math.PI).translate((i - half) * spacing, -h / 2, 0));
  }
  return merge(parts);
}

/** Fan of claws pointing down from the origin. */
export function claws(n: number, length: number, r: number, spread = 0.45): BufferGeometry {
  const half = (n - 1) / 2;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = half === 0 ? 0 : ((i - half) / half) * spread;
    parts.push(new ConeGeometry(r, length, 4).translate(0, -length / 2, 0).rotateZ(a).rotateX(0.25));
  }
  return merge(parts);
}

/** Subtle breathing and the occasional head twitch. Call every frame while alive. */
export function idleBreath(torsoMesh: Mesh, headMesh: Mesh | null, seconds: number, phase: number): void {
  const s = Math.sin(seconds * 1.8 + phase);
  torsoMesh.scale.set(1 + 0.012 * s, 1 + 0.022 * s, 1 + 0.012 * s);
  if (headMesh) {
    const twitch = Math.sin(seconds * 0.23 + phase) > 0.6 ? 1.6 : 0.4;
    headMesh.rotation.y = Math.sin(seconds * 0.7 + phase) * 0.12 * twitch;
  }
}
