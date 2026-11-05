// Offline preview of Isaac's model (Proposal 005, section 9). Not shipped.
// Software-rasterizes the new model (skinned body + rigid parts) into orthographic
// front / side / back views with flat Lambert shading and a 10 cm grid, so the model
// can be reviewed without a browser.
// Usage: bun scripts/isaac-render.ts <out.png> [idle|aim|walk|stasis|bind] [pixelsPerMeter] [y0:y1]
// The optional y0:y1 (meters) crops the views to a height band for close-ups (e.g. 1.4:1.86 for the helmet).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Color, Matrix3, Matrix4, Scene, Vector3, type BufferGeometry, type InstancedMesh, type Material, type Mesh, type SkinnedMesh } from 'three';

const ctx2d: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => ({})), set: (t: any, k, v) => ((t[k] = v), true) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }), getElementById: () => null };
(globalThis as any).location = { search: '' };

const { Player } = await import('../src/entities/Player');
const { resetToBind } = await import('../src/entities/isaac/IsaacSkeleton');

const [out = 'isaac.png', poseName = 'idle', ppmArg = '300', cropArg = ''] = process.argv.slice(2);
const PPM = Number(ppmArg);
const [Y0, Y1] = cropArg ? cropArg.split(':').map(Number) : [-0.05, 1.95];

// ── Build and pose ──
const player = new Player(new Scene(), new Proxy({}, { get: () => () => {} }) as any, new Vector3());
const model = player.model as any;
const input = { forward: false, backward: false, strafeLeft: false, strafeRight: false, sprint: false, aiming: false } as any;
if (poseName === 'aim') input.aiming = true;
if (poseName === 'walk') input.forward = true;
if (poseName === 'stasis') { input.aiming = true; player.isAiming = true; }
if (poseName !== 'bind') for (let t = 0; t < 1.3; t += 1 / 60) {
  if (poseName === 'stasis' && t > 1.1 && player.stasisAnimTimer <= 0) player.fireStasis();
  player.update(1 / 60, input, []);
  player.root.position.set(0, 0, 0);
}
else resetToBind(model.bones);
player.root.updateMatrixWorld(true);

// ── Collect world-space triangles with a linear albedo per vertex ──
interface Tri { p: Vector3[]; c: Color[] }
const tris: Tri[] = [];
model.root.traverse((o: any) => {
  const mesh = o as Mesh;
  if (!mesh.isMesh || !mesh.visible) return;
  if (mesh === model.holoScreen) return; // overlay hologram, not geometry
  const mat = mesh.material as Material & { color?: Color; vertexColors?: boolean };
  const g = mesh.geometry as BufferGeometry;
  const pos = g.attributes.position;
  const col = mat.vertexColors ? g.attributes.color : null;
  const skinned = (mesh as SkinnedMesh).isSkinnedMesh;
  const instanced = mesh as unknown as InstancedMesh;
  const instances = instanced.isInstancedMesh ? instanced.count : 1;
  const im = new Matrix4();
  for (let inst = 0; inst < instances; inst++) {
    const toWorld = instanced.isInstancedMesh ? (instanced.getMatrixAt(inst, im), im.premultiply(mesh.matrixWorld)) : mesh.matrixWorld;
    const world: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3();
      if (skinned) (mesh as SkinnedMesh).getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      world.push(v.applyMatrix4(toWorld));
    }
    const colorOf = (i: number) => {
      const c = col ? new Color(col.getX(i), col.getY(i), col.getZ(i)) : new Color(1, 1, 1);
      return mat.color ? c.multiply(mat.color) : c;
    };
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const ids = [0, 1, 2].map(k => (idx ? idx.getX(t + k) : t + k));
      tris.push({ p: ids.map(i => world[i]), c: ids.map(colorOf) });
    }
  }
});

// ── Views: screen x / depth from world (orthographic), y is up ──
const views: { name: string; sx: (v: Vector3) => number; depth: (v: Vector3) => number }[] = [
  { name: 'front', sx: v => v.x, depth: v => v.z },
  { name: 'side', sx: v => -v.z, depth: v => v.x },
  { name: 'back', sx: v => -v.x, depth: v => -v.z }
];
const VW = Math.round(Math.min(0.9, Math.max(0.5, (Y1 - Y0) * 1.2)) * PPM), VH = Math.round((Y1 - Y0) * PPM);
const W = VW * views.length, H = VH;
const rgb = new Float32Array(W * H * 3);
const zbuf = new Float32Array(W * H).fill(-Infinity);

// Background + 10 cm grid (brighter every 50 cm), floor at the bottom margin
const floorPx = H + Math.round(Y0 * PPM);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const hM = (floorPx - y) / PPM;
  const onLine = Math.abs(hM * 10 - Math.round(hM * 10)) * PPM < 0.05 * 10 && hM >= 0;
  const major = onLine && Math.round(hM * 10) % 5 === 0;
  const v = major ? 0.075 : onLine ? 0.035 : 0.012;
  rgb.set([v, v, v * 1.15], (y * W + x) * 3);
}

const light = new Vector3(-0.45, 0.6, 0.65).normalize();
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

views.forEach((view, vi) => {
  const ox = vi * VW + VW / 2;
  const proj = (v: Vector3) => ({ x: ox + view.sx(v) * PPM, y: floorPx - v.y * PPM, z: view.depth(v) });
  // Light is fixed relative to each view: rotate it into world space
  const m = new Matrix3();
  if (view.name === 'side') m.set(0, 0, 1, 0, 1, 0, -1, 0, 0);
  else if (view.name === 'back') m.set(-1, 0, 0, 0, 1, 0, 0, 0, -1);
  const L = light.clone().applyMatrix3(m);
  const e1 = new Vector3(), e2 = new Vector3(), nrm = new Vector3();
  for (const t of tris) {
    nrm.crossVectors(e1.subVectors(t.p[1], t.p[0]), e2.subVectors(t.p[2], t.p[0]));
    if (nrm.lengthSq() < 1e-14) continue;
    nrm.normalize();
    const facing = view.depth(nrm); // normal component toward the viewer
    if (facing < 0) nrm.negate(); // two-sided: face the viewer
    const shade = 0.3 + 0.7 * Math.max(0, nrm.dot(L));
    const a = proj(t.p[0]), b = proj(t.p[1]), c = proj(t.p[2]);
    const minX = Math.max(vi * VW, Math.floor(Math.min(a.x, b.x, c.x))), maxX = Math.min((vi + 1) * VW - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
      const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a.z + w1 * b.z + w2 * c.z;
      const k = y * W + x;
      if (z <= zbuf[k]) continue;
      zbuf[k] = z;
      const r = (w0 * t.c[0].r + w1 * t.c[1].r + w2 * t.c[2].r) * shade;
      const g = (w0 * t.c[0].g + w1 * t.c[1].g + w2 * t.c[2].g) * shade;
      const bl = (w0 * t.c[0].b + w1 * t.c[1].b + w2 * t.c[2].b) * shade;
      rgb.set([r, g, bl], k * 3);
    }
  }
});

// ── PNG out ──
const crc32 = (buf: Buffer) => {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
  raw[y * (1 + W * 3) + 1 + x * 3 + ch] = Math.round(Math.min(1, toSrgb(Math.max(0, rgb[(y * W + x) * 3 + ch]))) * 255);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]));
console.log(`wrote ${out} (${W}x${H}, ${tris.length} triangles, pose ${poseName})`);
