// Numeric checks for Isaac's visual model (Proposal 005). Not shipped.
// Usage: bun scripts/isaac-check.ts
// Builds the new model and the legacy one against a stub DOM/sound, steps the
// animation through several poses and checks the contract with Engine/camera.
import { Box3, Color, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector3, type InstancedMesh, type Material, type Object3D } from 'three';

// ── Minimal DOM stub: canvases with a no-op 2D context ──
const ctx2d: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => ({})), set: (t: any, k, v) => ((t[k] = v), true) });
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  getElementById: () => null
};

const { Player } = await import('../src/entities/Player');
const { PALETTE } = await import('../src/graphics/Palette');
const { BONE_DEFS, BONE_INDEX, JOINT_LIMITS, HAND_LENGTH, bindPosition } = await import('../src/entities/isaac/IsaacSkeleton');
const { TORSO_SECTIONS, sampleSection, armSections } = await import('../src/entities/isaac/IsaacBody');
const { chunkGeometry } = await import('../src/entities/isaac/GearKit');
const sound: any = new Proxy({}, { get: () => () => {} });

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`);
};
const fmt = (v: Vector3) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
const world = (o: Object3D) => o.getWorldPosition(new Vector3());
const hexOf = (c: Color) => c.getHex();

const idle = { forward: false, backward: false, strafeLeft: false, strafeRight: false, sprint: false, aiming: false } as any;
const step = (p: any, input: any, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) {
    p.update(dt, input, []);
    p.root.updateMatrixWorld(true);
  }
};

function build(mode: 'new' | 'legacy') {
  (globalThis as any).location = { search: mode === 'legacy' ? '?isaac=legacy' : '' };
  const scene = new Scene();
  const p = new Player(scene, sound, new Vector3(0, 0, 0));
  p.root.updateMatrixWorld(true);
  return p;
}

function stats(root: Object3D) {
  let tris = 0;
  let meshes = 0;
  const mats = new Set<Material>();
  root.traverse(o => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const instances = (m as unknown as InstancedMesh).isInstancedMesh ? (m as unknown as InstancedMesh).count : 1;
    tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * instances;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x));
  });
  return { tris: Math.round(tris), meshes, mats: mats.size };
}

/** Points bucketed in a uniform grid for radius queries. */
class PointGrid {
  private cells = new Map<string, { p: Vector3; tag: number }[]>();
  constructor(private readonly size: number) {}
  private key(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  add(p: Vector3, tag: number) {
    const k = this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size), Math.floor(p.z / this.size));
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push({ p, tag });
  }
  /** Nearest distance from `p` to a point whose tag passes `ok` (Infinity beyond one cell). */
  nearest(p: Vector3, ok: (tag: number) => boolean): number {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size), cz = Math.floor(p.z / this.size);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const e of this.cells.get(this.key(cx + dx, cy + dy, cz + dz)) ?? []) if (ok(e.tag)) best = Math.min(best, e.p.distanceTo(p));
    }
    return best;
  }
}

/** Gear checks (phase 3) and the phase 3 body adjustments. Run in the bind pose. */
function gearChecks(p: any) {
  const model = p.model;
  const gear = model.gear;
  const body = model.body;
  const bone = model.bones.bone;
  const v = new Vector3(), raw = new Vector3();

  // No plain boxes as visible armor: only the provisional RIG segments and Plasma Cutter (phase 5)
  let boxes = 0;
  model.root.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (!m.isMesh || m.geometry.type !== 'BoxGeometry') return;
    let w: Object3D | null = o;
    while (w && w !== p.weaponGroup) w = w.parent;
    if (!w && !p.rigSegments.includes(m)) boxes++;
  });
  check(boxes === 0, `no BoxGeometry armor outside the phase-5 placeholders (${boxes})`);

  // Rigid skinning: one bone, weight 1, and the bound gear matches its geometry
  for (const mesh of [gear.metal, gear.soft, gear.visor, gear.gloves]) {
    const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
    let bad = 0, err = 0;
    for (let i = 0; i < sw.count; i++) {
      if (sw.getX(i) !== 1 || sw.getY(i) || sw.getZ(i) || sw.getW(i) || si.getX(i) >= BONE_DEFS.length) bad++;
      mesh.getVertexPosition(i, v);
      err = Math.max(err, v.distanceTo(raw.fromBufferAttribute(pos, i)));
    }
    check(bad === 0 && err < 1e-5, `${mesh.name}: rigid weights (${bad} bad), bind error ${err.toExponential(1)}`);
  }
  check(gear.gloves.geometry.morphAttributes.position?.length === 4, `gloves: 4 pose morph targets (${gear.gloves.geometry.morphAttributes.position?.length})`);

  // Anchoring: every piece touches the body near its bone, or a piece of the same bone that does
  const parentOf = Object.fromEntries(BONE_DEFS.map(d => [d.name, d.parent]));
  const near = (a: string, b: string) => a === b || parentOf[a] === b || parentOf[b] === a;
  const boneNames = BONE_DEFS.map(d => d.name);
  const bodyGrid = new PointGrid(0.05);
  const bg = body.geometry, bsi = bg.attributes.skinIndex, bsw = bg.attributes.skinWeight;
  for (let i = 0; i < bg.attributes.position.count; i++) {
    bodyGrid.add(new Vector3().fromBufferAttribute(bg.attributes.position, i), bsw.getX(i) >= bsw.getY(i) ? bsi.getX(i) : bsi.getY(i));
  }
  const pieces = gear.pieces;
  const pieceGrid = new PointGrid(0.05);
  const pts: Vector3[][] = pieces.map((pc: any, k: number) => {
    const out: Vector3[] = [];
    const step = Math.max(1, Math.floor(pc.chunk.vertexCount / 400));
    for (let i = 0; i < pc.chunk.vertexCount; i += step) out.push(pc.chunk.point(i, new Vector3()));
    out.forEach(q => pieceGrid.add(q, k));
    return out;
  });
  const anchored = pieces.map((pc: any, k: number) => {
    let d = Infinity;
    for (const q of pts[k]) d = Math.min(d, bodyGrid.nearest(q, tag => near(boneNames[tag], pc.bone)));
    return d < 0.035;
  });
  for (let changed = true; changed;) {
    changed = false;
    pieces.forEach((pc: any, k: number) => {
      if (anchored[k]) return;
      for (const q of pts[k]) {
        if (pieceGrid.nearest(q, t => t !== k && anchored[t] && pieces[t].bone === pc.bone) < 0.02) { anchored[k] = changed = true; break; }
      }
    });
  }
  const floating = pieces.filter((_: any, k: number) => !anchored[k]).map((pc: any) => pc.name);
  check(floating.length === 0, `${pieces.length} gear pieces anchored to their bones (floating: ${floating.join(', ') || 'none'})`);

  // Bounds of the key parts
  const boxOf = (re: RegExp) => pieces.filter((pc: any) => re.test(pc.name)).reduce((b: Box3, pc: any) => b.union(pc.chunk.bounds()), new Box3());
  const helmetB = boxOf(/^helmet\./);
  const hw = helmetB.max.x - helmetB.min.x, hd = helmetB.max.z - helmetB.min.z;
  check(hw > 0.19 && hw < 0.23 && helmetB.max.y > 1.81 && helmetB.max.y < 1.85, `helmet ${hw.toFixed(3)} w x ${hd.toFixed(3)} d, top ${helmetB.max.y.toFixed(3)} (ref ~0.20 w, top ~1.825)`);
  const collarPc = pieces.find((pc: any) => pc.name === 'collar');
  let cw = 0;
  for (let i = 0; i < collarPc.chunk.vertexCount; i++) { collarPc.chunk.point(i, v); if (Math.abs(v.y - 1.55) < 0.012) cw = Math.max(cw, Math.abs(v.x) * 2); }
  check(cw > 0.29 && cw < 0.33, `collar width at 1.55 m: ${cw.toFixed(3)} (ref ~0.31)`);
  for (const side of ['L', 'R']) {
    const b = boxOf(new RegExp(`^boot\\..*\\.${side}$`));
    const len = b.max.z - b.min.z;
    check(len > 0.33 && len < 0.35 && Math.abs(b.min.y) < 0.002, `boot.${side}: length ${len.toFixed(3)} (ref 0.33-0.35), sole at y ${b.min.y.toFixed(3)}, top ${b.max.y.toFixed(3)}`);
  }
  for (const [name, b] of [['shoulder caps', boxOf(/^cap\./)], ['bracers', boxOf(/^(bracer|elbow)\./)], ['belt+pouches', boxOf(/^(belt|pouch)/)], ['knee pads', boxOf(/^knee\./)], ['gloves', boxOf(/^glove\./)]] as [string, Box3][]) {
    console.log(`      ${name.padEnd(13)} x ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)}  y ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)}  z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`);
  }

  // Body hidden under tubular gear: a ray from the limb axis through each body vertex must hit the gear beyond it
  const hidden = (label: string, re: RegExp, sel: (q: Vector3, boneIdx: number) => Vector3 | null) => {
    const targets = pieces.filter((pc: any) => re.test(pc.name)).map((pc: any) => new Mesh(chunkGeometry(pc.chunk), new MeshBasicMaterial({ side: DoubleSide })));
    targets.forEach((m: Mesh) => m.updateMatrixWorld(true));
    const ray = new Raycaster();
    let total = 0, exposed = 0;
    for (let i = 0; i < bg.attributes.position.count; i++) {
      const q = new Vector3().fromBufferAttribute(bg.attributes.position, i);
      const axis = sel(q, bsw.getX(i) >= bsw.getY(i) ? bsi.getX(i) : bsi.getY(i));
      if (!axis) continue;
      total++;
      const dir = q.clone().sub(axis);
      const dist = dir.length();
      ray.set(axis, dir.normalize());
      const hit = ray.intersectObjects(targets, false).find(h => h.distance > dist - 1e-4);
      if (!hit) exposed++;
    }
    check(total > 0 && exposed / total < 0.02, `${label}: body covered ${total - exposed}/${total}`);
  };
  const isBone = (idx: number, re: RegExp) => re.test(boneNames[idx]);
  hidden('boots over the calves', /^boot\./, (q, b) => (q.y > 0.175 && q.y < 0.495 && isBone(b, /^shin\./) ? new Vector3(Math.sign(q.x) * 0.1, q.y, 0) : null));
  hidden('bracers + glove cuffs over the forearms', /^(bracer|glove)\./, (q, b) => {
    if (q.y > 1.1 || q.y < 0.9 || !isBone(b, /^(forearm|hand)\./)) return null;
    const s = sampleSection([...armSections(q.x > 0 ? 'L' : 'R')].sort((a, c) => a.y - c.y), q.y);
    return new Vector3(s.cx, q.y, s.cz);
  });
  hidden('helmet + collar over the neck', /^(helmet|collar)/, q => (q.y > 1.535 && Math.abs(q.x) < 0.07 ? new Vector3(0, q.y, -0.01) : null));

  // Hand poses: grip curls the fingertips toward the wrist, open-palm extends them
  const tipReach = (side: string, inf: number[]) => {
    gear.gloves.morphTargetInfluences.splice(0, 4, ...inf);
    const w = bindPosition(`hand.${side}`);
    const tips = gear.gloveTips[side].slice(0, 4).map((i: number) => gear.gloves.getVertexPosition(i, new Vector3()).distanceTo(w));
    return tips.reduce((a: number, b: number) => a + b, 0) / tips.length;
  };
  for (const side of ['L', 'R']) {
    const o = side === 'L' ? 0 : 2;
    const relaxed = tipReach(side, [0, 0, 0, 0]);
    const grip = tipReach(side, o ? [0, 0, 1, 0] : [1, 0, 0, 0]);
    const open = tipReach(side, o ? [0, 0, 0, 1] : [0, 1, 0, 0]);
    check(grip < relaxed - 0.03 && open > relaxed && Math.abs(open - HAND_LENGTH) < 0.03,
      `glove.${side} fingertip reach from the wrist: grip ${grip.toFixed(3)} < relaxed ${relaxed.toFixed(3)} < open ${open.toFixed(3)} (hand ${HAND_LENGTH})`);
  }
  gear.gloves.morphTargetInfluences.fill(0);
  check(gear.rivets.defs.length >= 30, `rivets: ${gear.rivets.defs.length} instances in 1 draw call`);

  // Body adjustments: bare bideltoid width at 1.45 m in an A-pose like the reference, then with the caps
  const widthAt = (meshes: any[], y: number) => {
    let half = 0;
    for (const m of meshes) for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      m.getVertexPosition(i, v);
      if (Math.abs(v.y - y) < 0.006) half = Math.max(half, Math.abs(v.x));
    }
    return half * 2;
  };
  bone['upperarm.L'].rotation.z = 0.52;
  bone['upperarm.R'].rotation.z = -0.52;
  p.root.updateMatrixWorld(true);
  const bare = widthAt([body], 1.45), capped = widthAt([body, gear.soft], 1.45);
  check(bare > 0.43 && bare < 0.47, `A-pose shoulder width at 1.45 m, bare body: ${bare.toFixed(3)} (target 0.44-0.46)`);
  check(capped > 0.48 && capped < 0.52, `A-pose shoulder width at 1.45 m with caps: ${capped.toFixed(3)} (ref ~0.50)`);
  bone['upperarm.L'].rotation.z = 0;
  bone['upperarm.R'].rotation.z = 0;
  p.root.updateMatrixWorld(true);

  // Seat: the trouser back falls straight from the hips to the thigh (no fold), hip depth kept
  const back = (y: number) => {
    // +-11 mm: wider than the 2 cm ring spacing of the leg lofts, so every height finds vertices
    let z = Infinity, zf = -Infinity;
    for (let i = 0; i < bg.attributes.position.count; i++) {
      raw.fromBufferAttribute(bg.attributes.position, i);
      if (Math.abs(raw.y - y) < 0.011 && Math.abs(raw.x) < 0.2) { z = Math.min(z, raw.z); zf = Math.max(zf, raw.z); }
    }
    return { z, depth: zf - z };
  };
  const yTop = 0.93, yBot = 0.7, zTop = back(yTop).z, zBot = back(yBot).z;
  let fold = 0;
  for (let y = yBot; y <= yTop; y += 0.01) fold = Math.max(fold, back(y).z - (zBot + ((zTop - zBot) * (y - yBot)) / (yTop - yBot)));
  check(fold < 0.01, `seat falls straight: max fold ${fold.toFixed(4)} m inward of the hip-to-thigh line (back ${zTop.toFixed(3)} at ${yTop} m, ${zBot.toFixed(3)} at ${yBot} m)`);
  const depths = [0.9, 0.95, 1.0].map(y => back(y).depth);
  check(depths.every(d => d > 0.21 && d < 0.24), `hip depth kept: ${depths.map(d => d.toFixed(3)).join(' / ')} at 0.90 / 0.95 / 1.00 m`);
}

/** Rigid gear and rivets follow their bones in a pose (call after posing). */
function gearFollows(p: any, label: string) {
  const gear = p.model.gear;
  p.root.updateMatrixWorld(true);
  // Rivet i vs the nearest metal/soft vertex of its bone at bind: rigid, so the distance is unchanged
  const pos = new Vector3(), q = new Vector3(), m = new Matrix4();
  let worst = 0;
  const meshes = [gear.metal, gear.soft];
  gear.rivets.defs.forEach((def: any, i: number) => {
    if (i % 4) return;
    const bindP = new Vector3().setFromMatrixPosition(def.matrix);
    let best = Infinity, bestMesh: any = null, bestIdx = -1;
    for (const mesh of meshes) {
      const g = mesh.geometry;
      for (let k = 0; k < g.attributes.position.count; k++) {
        if (g.attributes.skinIndex.getX(k) !== BONE_INDEX[def.bone]) continue;
        const d = q.fromBufferAttribute(g.attributes.position, k).distanceTo(bindP);
        if (d < best) { best = d; bestMesh = mesh; bestIdx = k; }
      }
    }
    gear.rivets.mesh.getMatrixAt(i, m);
    pos.setFromMatrixPosition(m);
    bestMesh.getVertexPosition(bestIdx, q);
    worst = Math.max(worst, Math.abs(pos.distanceTo(q) - best));
  });
  check(worst < 1e-4, `${label}: rivets follow their bones (max drift ${worst.toExponential(1)})`);
}

const poses: Record<string, Record<string, Vector3>> = {};

// Follow camera (preset 4) used for framing and occlusion checks
const cam = new PerspectiveCamera(67, 16 / 9, 0.1, 100);
const camFor = (aiming: boolean) => {
  const head = new Vector3(0, 1.45, 0);
  cam.position.copy(head).add(aiming ? new Vector3(0.88, 0.18, -1.6) : new Vector3(0.75, 0.28, -2.9));
  cam.lookAt(head.clone().add(new Vector3(0, 0, 10)));
  cam.updateMatrixWorld();
  return cam;
};
/** True if Isaac's body (anything outside the weapon) blocks the camera's view of the emitter tip. */
const weaponOccluded = (p: any, aiming: boolean) => {
  const c = camFor(aiming);
  const target = p.weaponGroup.localToWorld(new Vector3(0, 0, 0.25));
  const dir = target.clone().sub(c.position);
  const ray = new Raycaster(c.position, dir.clone().normalize(), 0, dir.length() - 0.02);
  const body: Object3D[] = [];
  p.model.root.traverse((o: Object3D) => {
    let w: Object3D | null = o;
    while (w && w !== p.weaponGroup) w = w.parent;
    if ((o as Mesh).isMesh && !w) body.push(o);
  });
  return ray.intersectObjects(body, false).length > 0;
};

/** Skinned body checks (phase 2). Run right after construction, in the bind pose. */
function bodyChecks(p: any) {
  const model = p.model;
  const bone = model.bones.bone;
  const body = model.body;
  const g = body.geometry;
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const v = new Vector3(), raw = new Vector3();

  // Skeleton
  check(model.bones.skeleton.bones.length === BONE_DEFS.length && BONE_DEFS.length === 21, `21 bones (${BONE_DEFS.length})`);
  let worst = 0;
  for (const d of BONE_DEFS) worst = Math.max(worst, world(bone[d.name]).distanceTo(new Vector3(...d.pos)));
  check(worst < 1e-6, `bones at their bind positions (max error ${worst.toExponential(1)})`);

  // Weights
  let badSum = 0, tooMany = 0, badIndex = 0;
  for (let i = 0; i < sw.count; i++) {
    const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    if (Math.abs(w.reduce((a, b) => a + b, 0) - 1) > 1e-4) badSum++;
    if (w.filter(x => x > 0).length > 2) tooMany++;
    for (const k of [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)]) if (k >= BONE_DEFS.length) badIndex++;
  }
  check(badSum === 0, `skin weights sum to 1 (${badSum} bad of ${sw.count})`);
  check(tooMany === 0, `max 2 bones per vertex (${tooMany} over)`);
  check(g.userData.droppedWeights === 0, `no vertex needed a 3rd bone (${g.userData.droppedWeights} truncated)`);
  check(badIndex === 0, `skin indices valid (${badIndex} bad)`);
  console.log(`      body: ${pos.count} vertices, ${g.index.count / 3} triangles, 1 draw call`);

  // Bind correctness: skinned == raw at bind
  let bindErr = 0;
  for (let i = 0; i < pos.count; i++) {
    body.getVertexPosition(i, v);
    raw.fromBufferAttribute(pos, i);
    bindErr = Math.max(bindErr, v.distanceTo(raw));
  }
  check(bindErr < 1e-5, `skinned body matches geometry in bind pose (max ${bindErr.toExponential(1)})`);
  const bb = g.boundingBox;
  console.log(`      body bounds y ${bb.min.y.toFixed(3)}..${bb.max.y.toFixed(3)}, x ±${bb.max.x.toFixed(3)}, z ${bb.min.z.toFixed(3)}..${bb.max.z.toFixed(3)}`);

  // Proportions vs the reference (566 px = 1.82 m)
  const ref: [string, number, number][] = [
    ['knee (shin.L)', world(bone['shin.L']).y, 0.55],
    ['hip joint (thigh.L)', world(bone['thigh.L']).y, 0.93],
    ['shoulder (upperarm.L)', world(bone['upperarm.L']).y, 1.47],
    ['wrist (hand.L)', world(bone['hand.L']).y, 0.9]
  ];
  for (const [name, got, want] of ref) check(Math.abs(got - want) < 0.04, `proportion ${name}: ${got.toFixed(3)} (ref ~${want})`);

  // Edge stretch in a few poses: bad weights show up as long stretched edges
  const idx = g.index;
  const bindLen: number[] = [];
  const a = new Vector3(), b = new Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      a.fromBufferAttribute(pos, idx.getX(t + e));
      b.fromBufferAttribute(pos, idx.getX(t + ((e + 1) % 3)));
      bindLen.push(a.distanceTo(b));
    }
  }
  /** Max edge stretch of the skinned body in the current pose. */
  const measure = () => {
    p.root.updateMatrixWorld(true);
    let max = 0, nanCount = 0, minY = Infinity, where = new Vector3();
    const cache: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const q = body.getVertexPosition(i, new Vector3());
      if (![q.x, q.y, q.z].every(Number.isFinite)) nanCount++;
      minY = Math.min(minY, q.y);
      cache.push(q);
    }
    let k = 0;
    for (let t = 0; t < idx.count; t += 3) {
      for (let e = 0; e < 3; e++, k++) {
        const l0 = bindLen[k];
        if (l0 < 0.004) continue; // ignore cap slivers
        const l = cache[idx.getX(t + e)].distanceTo(cache[idx.getX(t + ((e + 1) % 3))]);
        if (l / l0 > max) {
          max = l / l0;
          where = a.fromBufferAttribute(pos, idx.getX(t + e)).clone();
        }
      }
    }
    return { max, where, minY, nanCount };
  };
  const MAX_STRETCH = 1.4;
  const report = (label: string, r: ReturnType<typeof measure>) =>
    check(r.nanCount === 0 && r.max < MAX_STRETCH, `${label}: skinned body finite, max edge stretch ${r.max.toFixed(2)}x (< ${MAX_STRETCH}) at bind ${fmt(r.where)}, min y ${r.minY.toFixed(3)}`);
  const stretch = (label: string) => report(label, measure());
  /** Worst stretch over a full gait cycle, sampled every 0.05 s. */
  const stretchCycle = (label: string, input: any, seconds: number) => {
    let worstR = measure();
    for (let t = 0; t < seconds; t += 0.05) {
      for (let k = 0; k < 3; k++) { p.update(1 / 60, input, []); p.root.position.set(0, 0, 0); }
      const r = measure();
      if (r.max > worstR.max || r.nanCount) worstR = r;
    }
    report(label, worstR);
  };
  const pose = (input: any, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      p.update(1 / 60, input, []);
      p.root.position.set(0, 0, 0);
    }
  };
  // Arms must not sink into the torso/hips when relaxed (bind-space torso, small spine motion)
  const sorted = [...TORSO_SECTIONS].sort((x, y) => x.y - y.y);
  const armBones = new Set(BONE_DEFS.map((d, i) => (/^(upperarm|forearm)\./.test(d.name) ? i : -1)).filter(i => i >= 0));
  const armInTorso = (label: string) => {
    p.root.updateMatrixWorld(true);
    let inside = 0, total = 0;
    const q = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (!armBones.has(si.getX(i)) || sw.getX(i) < 0.5) continue;
      total++;
      body.getVertexPosition(i, q);
      if (q.y < sorted[0].y || q.y > 1.31) continue; // above the armpit (~0.73 H) the arm joins the torso by design
      const sec = sampleSection(sorted, q.y);
      const dz = q.z - sec.cz;
      const f = Math.pow(Math.abs(q.x - sec.cx) / sec.rx, sec.n) + Math.pow(Math.abs(dz) / (dz >= 0 ? sec.zf : sec.zb), sec.n);
      if (f < 0.93) inside++; // ~5 mm tolerance
    }
    check(inside / total < 0.02, `${label}: arm vertices inside torso ${inside}/${total}`);
  };

  /** A 0.19 m hand must fit: fingertips clear of the thighs and the floor. */
  const handRoom = (label: string) => {
    p.root.updateMatrixWorld(true);
    const seg = (q: Vector3, a: Vector3, b: Vector3) => {
      const ab = b.clone().sub(a);
      const t = Math.min(1, Math.max(0, q.clone().sub(a).dot(ab) / ab.lengthSq()));
      return q.distanceTo(a.clone().addScaledVector(ab, t));
    };
    let minGap = Infinity, minY = Infinity;
    for (const hs of ['L', 'R']) {
      const tip = bone[`hand.${hs}`].localToWorld(new Vector3(0, -HAND_LENGTH, 0));
      minY = Math.min(minY, tip.y);
      for (const ls of ['L', 'R']) minGap = Math.min(minGap, seg(tip, world(bone[`thigh.${ls}`]), world(bone[`shin.${ls}`])) - 0.1);
    }
    check(minGap > 0 && minY > 0.5, `${label}: ${HAND_LENGTH} m hands fit (fingertip clearance from thighs ${minGap.toFixed(3)} m, lowest tip y ${minY.toFixed(2)})`);
  };

  pose(idle, 1); stretch('idle'); armInTorso('idle'); handRoom('idle');
  const inf = model.gear.gloves.morphTargetInfluences;
  check(inf[0] > 0.95 && inf[2] < 0.05 && inf[3] < 0.05, `idle: weapon hand grips (${inf[0].toFixed(2)}), off hand relaxed`);
  pose({ ...idle, forward: true }, 1); armInTorso('walk');
  pose({ ...idle, aiming: true }, 1); stretch('aim');
  pose({ ...idle, forward: true }, 0.5); stretchCycle('walk cycle', { ...idle, forward: true }, 1.2);
  pose({ ...idle, forward: true, sprint: true }, 0.5); stretchCycle('sprint cycle', { ...idle, forward: true, sprint: true }, 1.2);
  gearFollows(p, 'sprint');
  pose({ ...idle, strafeLeft: true, aiming: true }, 0.5); stretchCycle('aim strafe cycle', { ...idle, strafeLeft: true, aiming: true }, 1.2);
  p.isAiming = true; p.fireStasis(); pose({ ...idle, aiming: true }, 0.15); stretch('stasis');
  check(inf[3] > 0.5, `stasis: off hand opens (${inf[3].toFixed(2)})`);
  gearFollows(p, 'stasis');
  pose(idle, 1);
}

for (const mode of ['legacy', 'new'] as const) {
  console.log(`\n=== ${mode} model ===`);
  const p = build(mode);

  // Contract members
  for (const k of ['armL', 'weaponGroup', 'rigSegments', 'stasisSegmentMats', 'stasisLight', 'rigBackLight', 'holoScreen', 'holoLight', 'laserLine', 'spotLight', 'spotTarget', 'ammoCanvas', 'ammoTexture']) {
    check((p as any)[k] != null, `contract member ${k}`);
  }
  check(p.rigSegments.length === 6, `6 RIG segments (${p.rigSegments.length})`);
  check(p.stasisSegmentMats.length === 3, `3 stasis arcs (${p.stasisSegmentMats.length})`);
  check(p.spotTarget.parent === p.root, 'flashlight target under player.root');

  const s = stats(p.model.root);
  console.log(`      triangles ${s.tris}, meshes (draw calls) ${s.meshes}, materials ${s.mats}`);
  if (mode === 'new') {
    check(s.tris < 40000, `total triangles under 40k (${s.tris})`);
    check(s.meshes <= 26, `draw calls ~25 (${s.meshes})`);
    gearChecks(p);
    bodyChecks(p);
  }

  step(p, idle, 1);
  const box = new Box3().setFromObject(p.model.root);
  console.log(`      bounds min ${fmt(box.min)} max ${fmt(box.max)}`);
  if (mode === 'new') {
    check(Math.abs(box.max.y - 1.83) < 0.05, `height ~1.82 (${box.max.y.toFixed(3)})`);
    check(box.min.y > -0.03, `feet not below floor (${box.min.y.toFixed(3)})`);
  }

  const P: Record<string, Vector3> = {};
  P.weaponIdle = world(p.weaponGroup);
  const visIdle = !weaponOccluded(p, false);
  if (mode === 'new') check(visIdle, 'idle: emitter visible from the follow camera');
  else console.log(`info  idle: emitter visible from the follow camera: ${visIdle} (legacy, not asserted)`);
  P.armLIdle = world(p.armL);
  step(p, { ...idle, aiming: true }, 1);
  P.weaponAim = world(p.weaponGroup);
  const visAim = !weaponOccluded(p, true);
  if (mode === 'new') check(visAim, 'aim: emitter visible from the aim camera');
  else console.log(`info  aim: emitter visible from the aim camera: ${visAim} (legacy, not asserted)`);
  P.armLAim = world(p.armL);
  const barrel = new Vector3(0, 0, 1).transformDirection(p.weaponGroup.matrixWorld);
  check(barrel.z > 0.97, `aim: barrel points +Z ${fmt(barrel)}`);
  check(p.laserLine.visible, 'aim: laser visible');
  p.fireStasis();
  step(p, { ...idle, aiming: true }, 0.2);
  P.armLStasis = world(p.armL);
  poses[mode] = P;
  for (const [k, v] of Object.entries(P)) console.log(`      ${k.padEnd(11)} ${fmt(v)}`);

  // Locomotion sanity: no NaN, knees never hyperextend, feet stay near the floor
  let nan = false;
  let minY = Infinity;
  for (const input of [{ ...idle, forward: true }, { ...idle, forward: true, sprint: true }, { ...idle, strafeLeft: true }, { ...idle, backward: true, aiming: true }]) {
    for (let i = 0; i < 120; i++) {
      p.update(1 / 60, input, []);
      p.root.position.set(0, 0, 0); // keep in place, we only care about the pose
      p.root.updateMatrixWorld(true);
      p.model.root.traverse(o => {
        if (![o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z].every(Number.isFinite)) nan = true;
      });
      if (mode === 'new') {
        const bone = (p.model as any).bones.bone;
        for (const side of ['L', 'R']) {
          const [kLo, kHi] = JOINT_LIMITS.shin!.x;
          const [eLo, eHi] = JOINT_LIMITS.forearm!.x;
          const knee = bone[`shin.${side}`].rotation.x, elbow = bone[`forearm.${side}`].rotation.x;
          if (knee < kLo - 1e-6 || knee > kHi || elbow < eLo || elbow > eHi + 1e-6) nan = true;
          minY = Math.min(minY, world(bone[`foot.${side}`]).y);
        }
      }
    }
  }
  check(!nan, 'locomotion: finite transforms, knees/elbows within limits');
  if (mode === 'new') check(minY > 0.05, `locomotion: ankles stay above floor (min ${minY.toFixed(3)})`);

  // Tech colors (desaturated rig.* states)
  const P0 = build(mode);
  const segs = () => P0.rigSegments.map((m: any) => hexOf(m.material.color));
  check(segs().every(c => c === PALETTE.rig.ok), 'RIG full health: all rig.ok');
  P0.takeDamage(50);
  check(segs().slice(0, 3).every(c => c === PALETTE.rig.warn) && segs().slice(3).every(c => c === PALETTE.rig.off), 'RIG 50%: 3 warn + 3 off');
  P0.takeDamage(30);
  check(segs()[0] === PALETTE.rig.crit && segs()[1] === PALETTE.rig.crit && segs()[2] === PALETTE.rig.off, 'RIG 20%: 2 crit + rest off');
  check(hexOf(P0.rigBackLight.color) === PALETTE.rig.crit, 'RIG light crit');
  const arcs = () => P0.stasisSegmentMats.map(m => hexOf(m.color));
  check(arcs().every(c => c === PALETTE.rig.ok) && hexOf(P0.stasisLight.color) === PALETTE.rig.glow, 'stasis 3: ok arcs, glow light');
  P0.isAiming = true;
  P0.fireStasis();
  check(arcs()[0] === PALETTE.rig.warn && arcs()[2] === PALETTE.rig.off, 'stasis 2: warn, warn, off');
  P0.stasisCooldown = 0;
  P0.fireStasis();
  check(arcs()[0] === PALETTE.rig.crit && hexOf(P0.stasisLight.color) === PALETTE.rig.crit, 'stasis 1: crit');
  P0.ammo = 4; P0.updateHoloAmmo();
  check(hexOf(P0.holoLight.color) === PALETTE.rig.warn, 'ammo 4/10: holo light warn');
  P0.ammo = 2; P0.updateHoloAmmo();
  check(hexOf(P0.holoLight.color) === PALETTE.rig.crit, 'ammo 2/10: holo light crit');
  P0.ammo = 10; P0.updateHoloAmmo();
  check(hexOf(P0.holoLight.color) === PALETTE.rig.glow, 'ammo full: holo light glow');

  // Proximity fade reaches every material
  P0.setProximityOpacity(0.4);
  let opaque = 0;
  P0.model.root.traverse(o => {
    const m = (o as Mesh).material as Material | undefined;
    if (m && o !== P0.holoScreen && o !== P0.laserLine && Math.abs(m.opacity - 0.4) > 1e-6) opaque++;
  });
  check(opaque === 0, `proximity fade on every material (${opaque} missed)`);

  // Death
  P0.takeDamage(999);
  check(P0.isDead && Math.abs(P0.model.root.rotation.x) > 1, 'death pose applied');
}

// Screen side of the weapon vs Isaac in the follow camera (preset 4), both models
console.log('\n=== camera framing (screen x, -1 left .. 1 right) ===');
camFor(false);
for (const mode of ['legacy', 'new'] as const) {
  const sx = (v: Vector3) => v.clone().project(cam).x.toFixed(3);
  console.log(`      ${mode.padEnd(7)} isaac ${sx(new Vector3(0, 1.2, 0))}  weapon idle ${sx(poses[mode].weaponIdle)}  weapon aim ${sx(poses[mode].weaponAim)}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll Isaac checks passed');
process.exit(failures ? 1 : 0);
