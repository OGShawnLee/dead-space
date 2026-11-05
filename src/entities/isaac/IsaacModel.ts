import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
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
 * Phase 2: the body is the real skinned mesh; helmet, gloves, boots, belt, caps and
 * the Plasma Cutter are still provisional primitives attached to bones (phases 3 and 5).
 */
export class IsaacModel implements IsaacView {
  readonly root = new Group();
  readonly bones: IsaacBones;
  readonly body: SkinnedMesh;
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

  private readonly mats = {
    panel: new MeshStandardMaterial({ color: PALETTE.suit.panel, roughness: 0.7, metalness: 0 }),
    strap: new MeshStandardMaterial({ color: PALETTE.suit.strap, roughness: 0.75, metalness: 0 }),
    copper: new MeshStandardMaterial({ color: PALETTE.suit.copper, roughness: 0.6, metalness: 0.4 }),
    copperDark: new MeshStandardMaterial({ color: PALETTE.suit.copperDark, roughness: 0.65, metalness: 0.4 }),
    brass: new MeshStandardMaterial({ color: PALETTE.suit.brass, roughness: 0.55, metalness: 0.4 }),
    paint: new MeshStandardMaterial({ color: PALETTE.weapon.paint, roughness: 0.6, metalness: 0.2 }),
    gunmetal: new MeshStandardMaterial({ color: PALETTE.weapon.gunmetal, roughness: 0.5, metalness: 0.35 }),
    grip: new MeshStandardMaterial({ color: PALETTE.weapon.grip, roughness: 0.8, metalness: 0 }),
    visor: new MeshBasicMaterial({ color: PALETTE.rig.ok })
  };

  constructor(parent: Object3D, ammo: number, maxAmmo: number, opts: IsaacModelOptions = {}) {
    parent.add(this.root);
    const W = WEAPON_SIDE;
    const OFF: Side = W === 'L' ? 'R' : 'L';
    const ws = sideSign(W);
    const m = this.mats;

    // ── Skeleton + skinned body (bound in the bind pose) ──
    this.bones = buildSkeleton();
    this.root.add(this.bones.root);
    this.body = buildBody();
    this.root.add(this.body);
    this.root.updateMatrixWorld(true);
    this.body.bind(this.bones.skeleton);

    // ── Provisional gear on bones (phase 3 replaces it) ──
    // Helmet: 0.215 w x 0.25 h x 0.255 d, top at 1.825
    this.attach('head', new SphereGeometry(0.125, 28, 18), m.copper, [0, 1.7, 0.008], [0.86, 1, 1.02]);
    for (let i = 0; i < 3; i++) {
      this.attach('head', new BoxGeometry(0.1, 0.016, 0.03), m.visor, [0, 1.725 - i * 0.028, 0.128]);
    }
    this.attach('neck', new TorusGeometry(0.072, 0.02, 8, 28), m.copperDark, [0, 1.548, -0.014], [1, 1, 1], [Math.PI / 2, 0, 0]); // collar at the neck base
    this.attach('spine2', new BoxGeometry(0.15, 0.07, 0.03), m.copper, [0, 1.36, 0.152]); // chest yoke
    this.attach('hips', new TorusGeometry(0.155, 0.024, 8, 36), m.strap, [0, 1.04, -0.005], [1.1, 0.7, 1], [Math.PI / 2, 0, 0]); // belt
    this.attach('hips', new BoxGeometry(0.07, 0.045, 0.02), m.brass, [0, 1.04, 0.112]); // buckle

    for (const side of ['L', 'R'] as Side[]) {
      const x = sideSign(side);
      this.attach(`upperarm.${side}`, new SphereGeometry(0.072, 16, 10), m.panel, [x * 0.205, 1.462, -0.01], [1.2, 0.9, 1.1]); // shoulder cap
      this.attach(`forearm.${side}`, new CylinderGeometry(0.062, 0.055, 0.15, 16), m.copper, [x * 0.2, 1.01, -0.012]); // bracer
      this.attach(`hand.${side}`, new CapsuleGeometry(0.04, 0.07, 4, 10), m.panel, [x * 0.2, 0.84, -0.01], [0.75, 1, 1.15]); // glove
      this.attach(`shin.${side}`, new SphereGeometry(0.06, 14, 10), m.panel, [x * 0.1, 0.555, 0.075], [1.05, 1.15, 0.6]); // knee pad
      this.attach(`shin.${side}`, new CylinderGeometry(0.088, 0.079, 0.4, 18), m.copper, [x * 0.1, 0.32, -0.002]); // boot shaft
      this.attach(`foot.${side}`, new CapsuleGeometry(0.062, 0.19, 4, 12), m.copperDark, [x * 0.1, 0.06, 0.05], [1.1, 0.9, 1], [Math.PI / 2, 0, 0]);
      this.attach(`foot.${side}`, new BoxGeometry(0.13, 0.03, 0.3), m.panel, [x * 0.1, 0.015, 0.045]); // sole
    }

    // ── RIG spine: housing, 6 segments (bottom 3 on spine1, top 3 on spine2), pack ──
    this.attach('spine2', new BoxGeometry(0.085, 0.42, 0.025), m.copperDark, [0, 1.27, -0.12]);
    this.attach('spine2', new BoxGeometry(0.1, 0.08, 0.06), m.copperDark, [0, 1.475, -0.115]);
    const segH = 0.05;
    const segGap = 0.016;
    for (let i = 0; i < 6; i++) {
      const mesh = this.attach(i < 3 ? 'spine1' : 'spine2', new BoxGeometry(0.05, segH, 0.035), new MeshBasicMaterial({ color: PALETTE.rig.ok }), [0, 1.08 + segH / 2 + i * (segH + segGap), -0.135]);
      this.rigSegments.push(mesh as Mesh<BufferGeometry, MeshBasicMaterial>);
    }
    this.rigBackLight = buildRigBackLight(this.bones.bone.spine2, this.toBone('spine2', [0, 1.25, -0.3]));

    // Stasis socket on the weapon-side shoulder blade
    this.attach('spine2', new BoxGeometry(0.13, 0.15, 0.04), m.copperDark, [ws * 0.12, 1.38, -0.125]);
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
    this.debug?.update(dt);
    this.alignWeapon();
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
