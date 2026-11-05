// Numeric checks for Isaac's visual model (Proposal 005). Not shipped.
// Usage: bun scripts/isaac-check.ts
// Builds the new model and the legacy one against a stub DOM/sound, steps the
// animation through several poses and checks the contract with Engine/camera.
import { Box3, Color, Mesh, PerspectiveCamera, Raycaster, Scene, Vector3, type Material, type Object3D } from 'three';

// ── Minimal DOM stub: canvases with a no-op 2D context ──
const ctx2d: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => ({})), set: (t: any, k, v) => ((t[k] = v), true) });
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  getElementById: () => null
};

const { Player } = await import('../src/entities/Player');
const { PALETTE } = await import('../src/graphics/Palette');
const { BONE_DEFS, JOINT_LIMITS, HAND_LENGTH } = await import('../src/entities/isaac/IsaacSkeleton');
const { TORSO_SECTIONS, sampleSection } = await import('../src/entities/isaac/IsaacBody');
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
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x));
  });
  return { tris: Math.round(tris), meshes, mats: mats.size };
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
  pose({ ...idle, forward: true }, 1); armInTorso('walk');
  pose({ ...idle, aiming: true }, 1); stretch('aim');
  pose({ ...idle, forward: true }, 0.5); stretchCycle('walk cycle', { ...idle, forward: true }, 1.2);
  pose({ ...idle, forward: true, sprint: true }, 0.5); stretchCycle('sprint cycle', { ...idle, forward: true, sprint: true }, 1.2);
  pose({ ...idle, strafeLeft: true, aiming: true }, 0.5); stretchCycle('aim strafe cycle', { ...idle, strafeLeft: true, aiming: true }, 1.2);
  p.isAiming = true; p.fireStasis(); pose({ ...idle, aiming: true }, 0.15); stretch('stasis');
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
