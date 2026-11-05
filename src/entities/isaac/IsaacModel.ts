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
  type SpotLight
} from 'three';
import { PALETTE } from '../../graphics/Palette';
import type { IsaacAnimState, IsaacView } from './IsaacView';
import {
  applyProximityOpacity,
  buildAimLaser,
  buildAmmoHologram,
  buildFlashlight,
  buildRigBackLight,
  buildStasisGauge
} from './IsaacTech';

/**
 * X sign of the weapon / stasis / flashlight side. +X is screen-left of the follow
 * camera and Isaac's anatomical left (the camera sits over that shoulder today).
 * Flip to -1 to mirror the whole layout.
 */
export const WEAPON_SIDE = 1;

/** Joint pivots (model space, feet origin, faces +Z). Proportions from Proposal 005 5.1. */
export const ISAAC_JOINTS = {
  hipHeight: 0.92,
  hipHalfWidth: 0.105,
  thigh: 0.43,
  shin: 0.42,
  spineFromHips: 0.06,
  shoulderFromSpine: 0.44,
  shoulderHalfWidth: 0.22,
  upperArm: 0.3,
  forearm: 0.27,
  neckFromSpine: 0.5,
  headFromNeck: 0.08
} as const;

/** Exponential approach, frame-rate independent. */
const damp = (cur: number, target: number, rate: number, dt: number): number =>
  target + (cur - target) * Math.exp(-rate * dt);

interface Limb {
  root: Object3D; // shoulder or hip pivot
  mid: Object3D; // elbow or knee
  end: Object3D; // wrist or ankle
}

/**
 * Isaac's visual model (Proposal 005). Phase 1: a provisional capsule mannequin on a
 * joint hierarchy that already satisfies the `IsaacView` contract; the skinned body,
 * gear, RIG and Plasma Cutter replace its parts in later phases.
 */
export class IsaacModel implements IsaacView {
  readonly root = new Group();
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

  readonly hips = new Object3D();
  readonly spine = new Object3D();
  readonly neck = new Object3D();
  readonly head = new Object3D();
  readonly armMain: Limb;
  readonly armOff: Limb;
  readonly legMain: Limb;
  readonly legOff: Limb;

  /** Weapon socket in the weapon hand; re-oriented every frame so the barrel follows the model's +Z. */
  private readonly weaponMount = new Object3D();
  private readonly qRoot = new Quaternion();
  private readonly qHand = new Quaternion();
  private gaitPhase = 0;
  private time = 0;
  private currentOpacity = 1;

  private readonly mats = {
    fabric: new MeshStandardMaterial({ color: PALETTE.suit.fabric, roughness: 0.85, metalness: 0 }),
    fabricDark: new MeshStandardMaterial({ color: PALETTE.suit.fabricDark, roughness: 0.85, metalness: 0 }),
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

  constructor(parent: Object3D, ammo: number, maxAmmo: number) {
    parent.add(this.root);
    const J = ISAAC_JOINTS;
    const S = WEAPON_SIDE;
    const m = this.mats;

    // ── Hips and legs ──
    this.hips.position.set(0, J.hipHeight, 0);
    this.root.add(this.hips);
    this.part(this.hips, new SphereGeometry(0.16, 16, 12), m.fabricDark, 0, 0.02, 0, [1.1, 0.75, 0.8]);
    this.part(this.hips, new TorusGeometry(0.155, 0.03, 8, 24), m.strap, 0, 0.07, 0, [1.12, 0.8, 1], [Math.PI / 2, 0, 0]);
    this.part(this.hips, new BoxGeometry(0.07, 0.05, 0.02), m.brass, 0, 0.07, 0.13);

    this.legMain = this.buildLeg(S);
    this.legOff = this.buildLeg(-S);

    // ── Spine, torso, neck, helmet ──
    this.spine.position.set(0, J.spineFromHips, 0);
    this.hips.add(this.spine);
    this.part(this.spine, new CapsuleGeometry(0.16, 0.3, 6, 16), m.fabric, 0, 0.24, 0, [1.3, 1, 0.8]);
    this.part(this.spine, new BoxGeometry(0.16, 0.08, 0.04), m.copper, 0, 0.32, 0.13); // chest yoke
    this.part(this.spine, new BoxGeometry(0.09, 0.42, 0.03), m.copperDark, 0, 0.2, -0.145); // RIG housing strip
    this.part(this.spine, new BoxGeometry(0.1, 0.09, 0.06), m.copperDark, 0, 0.46, -0.13); // upper-back pack

    this.neck.position.set(0, J.neckFromSpine, 0);
    this.spine.add(this.neck);
    this.part(this.neck, new CylinderGeometry(0.07, 0.09, 0.1, 16), m.panel, 0, 0.03, 0);
    this.head.position.set(0, J.headFromNeck, 0);
    this.neck.add(this.head);
    // Helmet: 0.27 w x 0.32 h x 0.30 d, center ~1.68
    this.part(this.head, new SphereGeometry(0.15, 24, 16), m.copper, 0, 0.12, 0, [0.9, 1.07, 1]);
    this.part(this.head, new TorusGeometry(0.1, 0.022, 8, 24), m.copperDark, 0, 0.0, 0, [1, 1, 1], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      this.part(this.head, new BoxGeometry(0.13, 0.018, 0.03), m.visor, 0, 0.15 - i * 0.035, 0.135);
    }

    // ── RIG spine: 6 segments bottom to top along the back ──
    const segH = 0.052;
    const segGap = 0.018;
    for (let i = 0; i < 6; i++) {
      const seg = this.part(this.spine, new BoxGeometry(0.05, segH, 0.04), new MeshBasicMaterial({ color: PALETTE.rig.ok }), 0, 0.02 + i * (segH + segGap), -0.165);
      this.rigSegments.push(seg as Mesh<BufferGeometry, MeshBasicMaterial>);
    }
    this.rigBackLight = buildRigBackLight(this.spine, new Vector3(0, 0.2, -0.3));

    // Stasis socket on the shoulder blade (weapon side)
    this.part(this.spine, new BoxGeometry(0.14, 0.16, 0.05), m.copperDark, S * 0.13, 0.36, -0.145);
    const gauge = buildStasisGauge(this.spine, new Vector3(S * 0.13, 0.36, -0.17), m.copperDark, m.brass);
    this.stasisSegmentMats = gauge.mats;
    this.stasisLight = gauge.light;

    // ── Arms ──
    this.armMain = this.buildArm(S);
    this.armOff = this.buildArm(-S);
    this.armL = this.armOff.end;

    // ── Plasma Cutter placeholder, held in the weapon hand, barrel along +Z ──
    const mount = this.weaponMount;
    mount.position.set(0, -0.07, 0);
    this.armMain.end.add(mount);
    this.weaponGroup.position.set(0, 0.07, 0.06); // grip sits in the hand, body above it
    mount.add(this.weaponGroup);
    const w = this.weaponGroup;
    this.part(w, new BoxGeometry(0.09, 0.12, 0.34), m.gunmetal, 0, 0, 0);
    this.part(w, new BoxGeometry(0.1, 0.03, 0.3), m.paint, 0, 0.09, 0.02);
    this.part(w, new BoxGeometry(0.1, 0.03, 0.3), m.paint, 0, -0.09, 0.02);
    this.part(w, new BoxGeometry(0.05, 0.13, 0.06), m.grip, 0, -0.1, -0.1, [1, 1, 1], [0.25, 0, 0]);
    this.part(w, new CylinderGeometry(0.03, 0.03, 0.08, 12), m.gunmetal, 0, 0, 0.21, [1, 1, 1], [Math.PI / 2, 0, 0]);
    const holo = buildAmmoHologram(w, new Vector3(S * 0.17, 0.2, 0), ammo, maxAmmo);
    this.ammoCanvas = holo.ammoCanvas;
    this.ammoTexture = holo.ammoTexture;
    this.holoScreen = holo.holoScreen;
    this.holoLight = holo.holoLight;
    this.laserLine = buildAimLaser(w, new Vector3(0, 0, 0.25));

    // ── Flashlight on the weapon-side shoulder ──
    const flash = buildFlashlight(this.spine, parent, new Vector3(S * 0.24, 0.62, 0.12));
    this.spotLight = flash.spotLight;
    this.spotTarget = flash.spotTarget;

    // The body never casts shadows from the shoulder flashlight (self-shadowing)
    this.root.traverse(o => { o.castShadow = false; });
  }

  private part(
    parent: Object3D,
    geo: BufferGeometry,
    mat: Material,
    x: number, y: number, z: number,
    scale: [number, number, number] = [1, 1, 1],
    rot: [number, number, number] = [0, 0, 0]
  ): Mesh {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }

  private buildLeg(side: number): Limb {
    const J = ISAAC_JOINTS;
    const m = this.mats;
    const root = new Object3D();
    root.position.set(side * J.hipHalfWidth, -0.02, 0);
    this.hips.add(root);
    this.part(root, new CapsuleGeometry(0.075, J.thigh - 0.1, 4, 14), m.fabricDark, 0, -J.thigh / 2, 0);

    const mid = new Object3D();
    mid.position.set(0, -J.thigh, 0);
    root.add(mid);
    this.part(mid, new SphereGeometry(0.065, 12, 8), m.panel, 0, 0, 0.035, [1, 1.1, 0.7]); // knee pad
    this.part(mid, new CapsuleGeometry(0.06, J.shin - 0.1, 4, 14), m.fabricDark, 0, -J.shin / 2, 0);
    // Tall copper boot shaft
    this.part(mid, new CylinderGeometry(0.075, 0.068, 0.26, 16), m.copper, 0, -J.shin + 0.15, 0.005);

    const end = new Object3D();
    end.position.set(0, -J.shin, 0);
    mid.add(end);
    this.part(end, new CapsuleGeometry(0.058, 0.16, 4, 12), m.copperDark, 0, 0.0, 0.05, [1.05, 0.9, 1], [Math.PI / 2, 0, 0]);
    this.part(end, new BoxGeometry(0.12, 0.025, 0.27), m.panel, 0, -0.045, 0.05); // sole
    return { root, mid, end };
  }

  private buildArm(side: number): Limb {
    const J = ISAAC_JOINTS;
    const m = this.mats;
    const root = new Object3D();
    root.position.set(side * J.shoulderHalfWidth, J.shoulderFromSpine, 0);
    this.spine.add(root);
    this.part(root, new SphereGeometry(0.075, 14, 10), m.panel, 0, -0.01, 0, [1.1, 0.9, 1]); // shoulder cap
    this.part(root, new CapsuleGeometry(0.055, J.upperArm - 0.1, 4, 12), m.fabric, 0, -J.upperArm / 2, 0);

    const mid = new Object3D();
    mid.position.set(0, -J.upperArm, 0);
    root.add(mid);
    this.part(mid, new CapsuleGeometry(0.047, J.forearm - 0.1, 4, 12), m.fabric, 0, -J.forearm / 2, 0);
    this.part(mid, new CylinderGeometry(0.056, 0.05, 0.16, 14), m.copper, 0, -J.forearm + 0.1, 0); // bracer

    const end = new Object3D();
    end.position.set(0, -J.forearm, 0);
    mid.add(end);
    this.part(end, new CapsuleGeometry(0.042, 0.07, 4, 10), m.panel, 0, -0.06, 0, [1.1, 1, 0.75]); // glove
    return { root, mid, end };
  }

  update(dt: number, s: IsaacAnimState): void {
    this.time += dt;
    const S = WEAPON_SIDE;
    const R = 14; // damping rate for pose blending

    // Gait phase advances with distance, not time (stride ~1.3 m walking, longer sprinting)
    const stride = s.sprint ? 1.9 : 1.3;
    this.gaitPhase = (this.gaitPhase + (s.speed * dt / stride) * Math.PI * 2) % (Math.PI * 2);
    const amp = Math.min(1, s.speed / 3.8) * (s.sprint ? 0.75 : 0.5);
    const fwd = s.velocityLocal.z;
    const side = s.velocityLocal.x;
    const swing = Math.sin(this.gaitPhase);

    const leg = (l: Limb, sign: number) => {
      const ph = swing * sign;
      const back = Math.max(0, Math.cos(this.gaitPhase) * sign); // knee flexes only (never hyperextends)
      l.root.rotation.x = damp(l.root.rotation.x, -ph * amp * (Math.abs(fwd) > 0.1 ? Math.sign(fwd) : 0.4), R, dt);
      l.root.rotation.z = damp(l.root.rotation.z, ph * amp * side * 0.35, R, dt);
      l.mid.rotation.x = damp(l.mid.rotation.x, back * amp * 1.3, R, dt);
      l.end.rotation.x = damp(l.end.rotation.x, -back * amp * 0.4, R, dt);
    };
    leg(this.legMain, 1);
    leg(this.legOff, -1);

    // Hips bob, spine lean / counter-rotation / breathing
    const bob = Math.abs(Math.cos(this.gaitPhase)) * 0.025 * amp * 2;
    this.hips.position.y = damp(this.hips.position.y, ISAAC_JOINTS.hipHeight - 0.02 * amp + bob, R, dt);
    const breathe = Math.sin(this.time * 1.7) * 0.015;
    const lean = (s.sprint ? 0.16 : 0.04 * Math.abs(fwd) * amp) + (s.aiming ? 0.04 : 0) - s.hurtT * 0.6;
    this.spine.rotation.x = damp(this.spine.rotation.x, lean + breathe - (s.stasisT > 0 ? 0.05 : 0), R, dt);
    this.spine.rotation.y = damp(this.spine.rotation.y, -swing * amp * 0.25 * Math.sign(fwd || 1), R, dt);
    this.head.rotation.x = damp(this.head.rotation.x, 0.08 - lean * 0.5 + s.hurtT * 0.5, R, dt);

    // Weapon arm: low-ready (elbow bent, forearm forward) or aim (arm extended)
    const a = this.armMain;
    const inward = -S * (s.aiming ? 0.05 : 0.1);
    const shoulderX = s.aiming ? -1.5 : -0.25 + swing * amp * 0.12;
    const elbowX = s.aiming ? -0.07 : -1.32;
    a.root.rotation.x = damp(a.root.rotation.x, shoulderX - s.reloadT * 0.4, R, dt);
    a.root.rotation.z = damp(a.root.rotation.z, inward, R, dt);
    a.mid.rotation.x = damp(a.mid.rotation.x, elbowX, R, dt);

    // Off arm (stasis): thrust, aim support, or relaxed swing
    const o = this.armOff;
    let oX: number;
    let oZ: number;
    let oElbow: number;
    if (s.stasisT > 0) {
      oX = -1.45; oZ = S * 0.12; oElbow = -0.05;
    } else if (s.aiming) {
      oX = -1.15; oZ = S * 0.55; oElbow = -0.55;
    } else {
      oX = -swing * amp * 0.7 * Math.sign(fwd || 1); oZ = -S * 0.08; oElbow = -0.2 - amp * 0.3;
    }
    o.root.rotation.x = damp(o.root.rotation.x, oX, R, dt);
    o.root.rotation.z = damp(o.root.rotation.z, oZ, R, dt);
    o.mid.rotation.x = damp(o.mid.rotation.x, oElbow, R, dt);

    this.alignWeapon();
  }

  /** Keeps the weapon level along the model's +Z whatever the arm pose, so the laser and beam stay true. */
  private alignWeapon(): void {
    this.root.getWorldQuaternion(this.qRoot);
    this.armMain.end.getWorldQuaternion(this.qHand);
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
