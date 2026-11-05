// Compares Isaac's front/side silhouette widths per height against the Level 1 suit
// reference (proposals/references/isaac-level1-suit.png). Not shipped.
// The model is posed in an A-pose like the reference (arms ~30 degrees out) and rasterized
// orthographically; each row reports the central run width in meters for the full model
// (body + gear) and the bare body, next to the reference scaled to 1.82 m.
// Usage: bun scripts/isaac-silhouette.ts
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Scene, Vector3, type BufferGeometry, type Mesh, type SkinnedMesh } from 'three';

const ctx2d: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => ({})), set: (t: any, k, v) => ((t[k] = v), true) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }), getElementById: () => null };
(globalThis as any).location = { search: '' };
const { Player } = await import('../src/entities/Player');
const { resetToBind } = await import('../src/entities/isaac/IsaacSkeleton');

const H_TOTAL = 1.82;
const HEIGHTS = Array.from({ length: 36 }, (_, i) => +(0.05 + i * 0.05).toFixed(2));

// ── Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) ──
interface Img { w: number; h: number; ch: number; px: Uint8Array }

function readPng(path: string | URL): Img {
  const b = readFileSync(path);
  let o = 8, w = 0, h = 0, ct = 0;
  const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error('unsupported'); }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!ch) throw new Error('color type ' + ct);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, ch, px };
}

const lum = (img: Img, x: number, y: number) => {
  const i = (y * img.w + x) * img.ch;
  return 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2];
};

// ── Reference: central run per row ──
function refProfile(img: Img, x0: number, x1: number, thr = 10) {
  const mask = (x: number, y: number) => lum(img, x, y) > thr;
  let top = -1, bot = -1;
  for (let y = 10; y < 597; y++) {
    let n = 0; for (let x = x0; x < x1; x++) if (mask(x, y)) n++;
    if (n >= 3) { if (top < 0) top = y; bot = y; }
  }
  // center column: median of mask x over the torso band
  const xs: number[] = [];
  const yc0 = Math.round(top + (bot - top) * 0.3), yc1 = Math.round(top + (bot - top) * 0.45);
  for (let y = yc0; y < yc1; y++) for (let x = x0; x < x1; x++) if (mask(x, y)) xs.push(x);
  xs.sort((a, b) => a - b);
  const cx = xs[Math.floor(xs.length / 2)];
  const mPerPx = H_TOTAL / (bot - top);
  const run = (y: number) => {
    // close gaps <= 5 px, then expand from the center column
    const row = Array.from({ length: x1 - x0 }, (_, i) => mask(x0 + i, y));
    let c = cx - x0;
    if (!row[c]) { let d = 1; while (d < 25 && !row[c - d] && !row[c + d]) d++; if (d >= 25) return 0; c = row[c - d] ? c - d : c + d; }
    let l = c, r = c, gap = 0;
    for (let i = c - 1; i >= 0; i--) { if (row[i]) { l = i; gap = 0; } else if (++gap > 5) break; }
    gap = 0;
    for (let i = c + 1; i < row.length; i++) { if (row[i]) { r = i; gap = 0; } else if (++gap > 5) break; }
    return (r - l + 1) * mPerPx;
  };
  return { top, bot, cx, prof: HEIGHTS.map(h => run(Math.round(bot - (h / H_TOTAL) * (bot - top)))) };
}

// ── Model: rasterize to a mask, central run per row ──
function modelProfile(meshFilter: (m: Mesh) => boolean, view: 'front' | 'side') {
  const PPM = 500, W = 1.6 * PPM, Hh = 2 * PPM;
  const mask = new Uint8Array(W * Hh);
  const sx = (v: Vector3) => (view === 'front' ? v.x : -v.z) * PPM + W / 2;
  const sy = (v: Vector3) => Hh - v.y * PPM;
  model.root.traverse((o: any) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || (o as any).isInstancedMesh || !mesh.visible || o === model.holoScreen || !meshFilter(mesh)) return;
    const g = mesh.geometry as BufferGeometry, pos = g.attributes.position;
    const world: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3();
      if ((mesh as SkinnedMesh).isSkinnedMesh) (mesh as SkinnedMesh).getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
      world.push(v.applyMatrix4(mesh.matrixWorld));
    }
    const idx = g.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const p = [0, 1, 2].map(k => world[idx ? idx.getX(t + k) : t + k]).map(v => ({ x: sx(v), y: sy(v) }));
      const [a, b, c] = p, area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y <= Math.min(Hh - 1, Math.ceil(Math.max(a.y, b.y, c.y))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x <= Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x))); x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area, w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
          if (w0 >= 0 && w1 >= 0 && 1 - w0 - w1 >= 0) mask[y * W + x] = 1;
        }
    }
  });
  return HEIGHTS.map(h => {
    const y = Math.round(Hh - h * PPM), row = (x: number) => mask[y * W + x];
    let c = W / 2;
    if (!row(c)) { let d = 1; while (d < 60 && !row(c - d) && !row(c + d)) d++; if (d >= 60) return 0; c = row(c - d) ? c - d : c + d; }
    let l = c, r = c, gap = 0;
    for (let i = c - 1; i >= 0; i--) { if (row(i)) { l = i; gap = 0; } else if (++gap > 4) break; }
    gap = 0;
    for (let i = c + 1; i < W; i++) { if (row(i)) { r = i; gap = 0; } else if (++gap > 4) break; }
    return (r - l + 1) / PPM;
  });
}

const player = new Player(new Scene(), new Proxy({}, { get: () => () => {} }) as any, new Vector3());
const model = player.model as any;
resetToBind(model.bones);
// A-pose like the reference (arms ~30 degrees out)
model.bones.bone['upperarm.L'].rotation.z = 0.52;
model.bones.bone['upperarm.R'].rotation.z = -0.52;
player.root.updateMatrixWorld(true);

const img = readPng(new URL('../proposals/references/isaac-level1-suit.png', import.meta.url));
const refFront = refProfile(img, 15, 400);
const refSide = refProfile(img, 740, 1000);
console.log(`ref front: top ${refFront.top} bot ${refFront.bot} cx ${refFront.cx}; side: top ${refSide.top} bot ${refSide.bot}`);
const bodyOnly = (m: Mesh) => m.name === 'isaac-body';
const fFull = modelProfile(() => true, 'front'), fBody = modelProfile(bodyOnly, 'front');
const sFull = modelProfile(() => true, 'side'), sBody = modelProfile(bodyOnly, 'side');
console.log('  h   | FRONT ref  full  body  full/ref | SIDE ref  full  body  full/ref');
HEIGHTS.forEach((h, i) => {
  const r = (a: number, b: number) => (b > 0 ? (a / b).toFixed(2) : '  - ');
  console.log(`${h.toFixed(2)} |       ${refFront.prof[i].toFixed(3)} ${fFull[i].toFixed(3)} ${fBody[i].toFixed(3)}  ${r(fFull[i], refFront.prof[i])}    |      ${refSide.prof[i].toFixed(3)} ${sFull[i].toFixed(3)} ${sBody[i].toFixed(3)}  ${r(sFull[i], refSide.prof[i])}`);
});
