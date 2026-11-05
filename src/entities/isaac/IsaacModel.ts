import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type CanvasTexture,
  type Line,
  type LineBasicMaterial,
  type Material,
  type PlaneGeometry,
  type PointLight,
  type Scene,
  type SkinnedMesh,
  type SpotLight
} from 'three';
import { PALETTE } from '../../graphics/Palette';
import type { IsaacAnimState, IsaacView } from './IsaacView';
import { bindPosition, buildSkeleton, resetToBind, sideSign, type BoneName, type IsaacBones, type Side } from './IsaacSkeleton';
import { buildBody } from './IsaacBody';
import { buildGear, type IsaacGear } from './IsaacGear';
import { GLOVE_MORPHS } from './IsaacGloves';
import { IsaacAnimator } from './IsaacAnimator';
import { IsaacDebug } from './IsaacDebug';
import {
  applyProximityOpacity,
  buildAimLaser,
  buildAmmoHologram,
  buildFlashlight,
  buildRigBackLight,
  buildStasisGauge
} from './IsaacTech';

/**
 * Side that holds the weapon and carries the stasis socket and flashlight.
 * `L` (+X) is the side the follow camera looks over (owner decision: keep the camera).
 */
export const WEAPON_SIDE: Side = 'L';

export interface IsaacModelOptions {
  /** Scene for debug helpers. */
  scene?: Scene;
  /** `?isaac=debug`: skeleton overlay, turntable, pose keys. */
  debug?: boolean;
}

/**
 * Isaac's visual model (Proposal 005): skeleton + skinned fabric body + gear + tech.
 * Phase 3: the gear (helmet, collar, yoke, caps, bracers, gloves, belt, knee pads,
 * pockets, boots) is rigid-skinned and merged per material; the RIG segments, stasis
 * gauge and the Plasma Cutter are still provisional (phase 5).
 */
export class IsaacModel implements IsaacView {
  readonly root = new Group();
  readonly bones: IsaacBones;
  readonly body: SkinnedMesh;
  readonly gear: IsaacGear;
  readonly armL: Object3D;
  readonly weaponGroup = new Group();
  readonly rigSegments: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  readonly stasisSegmentMats: MeshBasicMaterial[];
  readonly stasisLight: PointLight;
  readonly rigBackLight: PointLight;
  readonly ammoCanvas: HTMLCanvasElement;
  readonly ammoTexture: CanvasTexture;
  readonly holoScreen: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly holoLight: PointLight;
  readonly laserLine: Line<BufferGeometry, LineBasicMaterial>;
  readonly spotLight: SpotLight;
  readonly spotTarget: Object3D;

  private readonly animator: IsaacAnimator;
  private readonly debug?: IsaacDebug;
  /** Weapon socket in the weapon hand; re-oriented every frame so the barrel follows the model's +Z. */
  private readonly weaponMount = new Object3D();
  private readonly qRoot = new Quaternion();
  private readonly qHand = new Quaternion();
  private currentOpacity = 1;
  /** Current hand pose blend per side (0..1), damped toward the targets. */
  private readonly hands = { L: { grip: 0, open: 0 }, R: { grip: 0, open: 0 } };

  // Provisional tech hardware (stasis gauge) and Plasma Cutter (phase 5)
  private readonly mats = {
    copperDark: new MeshStandardMaterial({ color: PALETTE.suit.copperDark, roughness: 0.65, metalness: 0.4 }),
    brass: new MeshStandardMaterial({ color: PALETTE.suit.brass, roughness: 0.55, metalness: 0.4 }),
    paint: new MeshStandardMaterial({ color: PALETTE.weapon.paint, roughness: 0.6, metalness: 0.2 }),
    gunmetal: new MeshStandardMaterial({ color: PALETTE.weapon.gunmetal, roughness: 0.5, metalness: 0.35 }),
    grip: new MeshStandardMaterial({ color: PALETTE.weapon.grip, roughness: 0.8, metalness: 0 })
  };

  constructor(parent: Object3D, ammo: number, maxAmmo: number, opts: IsaacModelOptions = {}) {
    parent.add(this.root);
    const W = WEAPON_SIDE;
    const OFF: Side = W === 'L' ? 'R' : 'L';
    const ws = sideSign(W);
    const m = this.mats;

    // ── Skeleton, skinned body and rigid-skinned gear (all bound in the bind pose) ──
    this.bones = buildSkeleton();
    this.root.add(this.bones.root);
    this.body = buildBody();
    this.gear = buildGear(W);
    const skinned = [this.body, this.gear.metal, this.gear.soft, this.gear.visor, this.gear.gloves];
    for (const mesh of skinned) this.root.add(mesh);
    this.root.add(this.gear.rivets.mesh);
    this.root.updateMatrixWorld(true);
    for (const mesh of skinned) mesh.bind(this.bones.skeleton);
    this.gear.rivets.update(this.bones);

    // ── RIG spine: 6 segments (bottom 3 on spine1, top 3 on spine2); housing and pack are gear ──
    const segH = 0.05;
    const segGap = 0.016;
    for (let i = 0; i < 6; i++) {
      const mesh = this.attach(i < 3 ? 'spine1' : 'spine2', new BoxGeometry(0.05, segH, 0.035), new MeshBasicMaterial({ color: PALETTE.rig.ok }), [0, 1.08 + segH / 2 + i * (segH + segGap), -0.135]);
      this.rigSegments.push(mesh as Mesh<BufferGeometry, MeshBasicMaterial>);
    }
    this.rigBackLight = buildRigBackLight(this.bones.bone.spine2, this.toBone('spine2', [0, 1.25, -0.3]));

    // Stasis socket on the weapon-side shoulder blade (its plate is gear)
    const gauge = buildStasisGauge(this.bones.bone.spine2, this.toBone('spine2', [ws * 0.12, 1.38, -0.15]), m.copperDark, m.brass);
    this.stasisSegmentMats = gauge.mats;
    this.stasisLight = gauge.light;

    // Contract: `armL` is the off (stasis) hand
    this.armL = this.bones.bone[`hand.${OFF}`];

    // ── Plasma Cutter placeholder (phase 5 replaces it), held in the weapon hand ──
    this.weaponMount.position.set(0, -0.07, 0);
    this.bones.bone[`hand.${W}`].add(this.weaponMount);
    this.weaponGroup.position.set(0, 0.07, 0.06); // grip in the hand, body above it
    this.weaponMount.add(this.weaponGroup);
    const w = this.weaponGroup;
    this.part(w, new BoxGeometry(0.09, 0.12, 0.34), m.gunmetal, [0, 0, 0]);
    this.part(w, new BoxGeometry(0.1, 0.03, 0.3), m.paint, [0, 0.09, 0.02]);
    this.part(w, new BoxGeometry(0.1, 0.03, 0.3), m.paint, [0, -0.09, 0.02]);
    this.part(w, new BoxGeometry(0.05, 0.13, 0.06), m.grip, [0, -0.1, -0.1], [1, 1, 1], [0.25, 0, 0]);
    this.part(w, new CylinderGeometry(0.03, 0.03, 0.08, 12), m.gunmetal, [0, 0, 0.21], [1, 1, 1], [Math.PI / 2, 0, 0]);
    const holo = buildAmmoHologram(w, new Vector3(ws * 0.17, 0.2, 0), ammo, maxAmmo);
    this.ammoCanvas = holo.ammoCanvas;
    this.ammoTexture = holo.ammoTexture;
    this.holoScreen = holo.holoScreen;
    this.holoLight = holo.holoLight;
    this.laserLine = buildAimLaser(w, new Vector3(0, 0, 0.25));

    // ── Flashlight on the weapon-side shoulder ──
    const flash = buildFlashlight(this.bones.bone.spine2, parent, this.toBone('spine2', [ws * 0.2, 1.545, 0.06]));
    this.spotLight = flash.spotLight;
    this.spotTarget = flash.spotTarget;

    // The body never casts shadows from the shoulder flashlight (self-shadowing)
    this.root.traverse(o => { o.castShadow = false; });

    this.animator = new IsaacAnimator(this.bones, W);
    if (opts.debug && opts.scene) this.debug = new IsaacDebug(opts.scene, this.root, this.body);
  }

  /** Model-space bind position -> local position under `bone`. */
  private toBone(bone: BoneName, pos: [number, number, number]): Vector3 {
    return new Vector3(...pos).sub(bindPosition(bone));
  }

  /** Adds a rigid part to a bone, positioned in model-space bind coordinates. */
  private attach(
    bone: BoneName,
    geo: BufferGeometry,
    mat: Material,
    pos: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rot: [number, number, number] = [0, 0, 0]
  ): Mesh {
    const local = this.toBone(bone, pos);
    return this.part(this.bones.bone[bone], geo, mat, [local.x, local.y, local.z], scale, rot);
  }

  private part(
    parent: Object3D,
    geo: BufferGeometry,
    mat: Material,
    pos: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rot: [number, number, number] = [0, 0, 0]
  ): Mesh {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }

  update(dt: number, s: IsaacAnimState): void {
    if (this.debug?.bindPose) resetToBind(this.bones);
    else this.animator.update(dt, s);
    this.updateHands(dt, s);
    this.gear.rivets.update(this.bones);
    this.debug?.update(dt);
    this.alignWeapon();
  }

  /**
   * Hand poses as morph weights: the weapon hand always grips; the off hand opens for
   * the stasis thrust, half-closes while aiming (support) and otherwise relaxes.
   */
  private updateHands(dt: number, s: IsaacAnimState): void {
    const W = WEAPON_SIDE, OFF: Side = W === 'L' ? 'R' : 'L';
    const k = 1 - Math.exp(-12 * dt);
    const target = {
      [W]: { grip: 1, open: 0 },
      [OFF]: s.stasisT > 0 ? { grip: 0, open: 1 } : { grip: s.aiming ? 0.45 : 0, open: 0 }
    } as Record<Side, { grip: number; open: number }>;
    const inf = this.gear.gloves.morphTargetInfluences;
    for (const side of ['L', 'R'] as Side[]) {
      const h = this.hands[side];
      h.grip += (target[side].grip - h.grip) * k;
      h.open += (target[side].open - h.open) * k;
      inf[GLOVE_MORPHS.indexOf(`grip.${side}`)] = h.grip;
      inf[GLOVE_MORPHS.indexOf(`open.${side}`)] = h.open;
    }
  }

  /** Keeps the weapon level along the model's +Z whatever the arm pose, so the laser and beam stay true. */
  private alignWeapon(): void {
    this.root.getWorldQuaternion(this.qRoot);
    this.bones.bone[`hand.${WEAPON_SIDE}`].getWorldQuaternion(this.qHand);
    this.weaponMount.quaternion.copy(this.qHand.invert().multiply(this.qRoot));
  }

  setProximityOpacity(opacity: number): void {
    if (Math.abs(this.currentOpacity - opacity) < 0.01) return;
    this.currentOpacity = opacity;
    applyProximityOpacity([this.root], opacity, this.holoScreen, this.laserLine);
  }

  playDeath(): void {
    this.root.rotation.x = -Math.PI / 2.2;
    this.root.position.y = 0.2;
  }
}
