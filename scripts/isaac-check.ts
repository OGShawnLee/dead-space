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
        const m = p.model as any;
        for (const leg of [m.legMain, m.legOff]) {
          if (leg.mid.rotation.x < -1e-6) nan = true;
          minY = Math.min(minY, world(leg.end).y);
        }
      }
    }
  }
  check(!nan, 'locomotion: finite transforms, knees never hyperextend');
  if (mode === 'new') check(minY > 0.0, `locomotion: ankles stay above floor (min ${minY.toFixed(3)})`);

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
