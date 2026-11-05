import type { IsaacAnimState } from './IsaacView';
import { sideSign, type IsaacBones, type Side } from './IsaacSkeleton';

/** Exponential approach, frame-rate independent. */
const damp = (cur: number, target: number, rate: number, dt: number): number =>
  target + (cur - target) * Math.exp(-rate * dt);

/**
 * Relaxed stance layered under everything (radians, see IsaacSkeleton for signs):
 * forward head carriage, shoulders rolled forward and slightly dropped, soft knees
 * and elbows, free hand hanging in front of the thigh.
 */
const STANCE = {
  neckForward: 0.16,
  headLevel: -0.1, // counters the neck so the visor still looks ahead
  clavicleForward: 0.14,
  clavicleDrop: 0.05,
  thigh: -0.05,
  knee: 0.1,
  ankle: -0.05,
  offShoulderForward: -0.14,
  offAbduction: 0.24,
  offElbow: -0.3,
  offForearmIn: 0.15
} as const;

/**
 * Procedural animation (Proposal 005, section 6). Pure function of the intent struct
 * plus a little internal state (gait phase, clock).
 *
 * Current state: provisional layer (distance-driven leg swing, spine lean and
 * breathing, low-ready/aim/stasis arm poses) over the relaxed stance. Phase 6
 * replaces the legs with IK gait and directional blending; phase 7 adds the action
 * layers.
 */
export class IsaacAnimator {
  private gaitPhase = 0;
  private time = 0;
  private readonly weapon: Side;
  private readonly off: Side;
  private readonly hipHeight: number;

  constructor(private readonly bones: IsaacBones, weaponSide: Side) {
    this.weapon = weaponSide;
    this.off = weaponSide === 'L' ? 'R' : 'L';
    this.hipHeight = bones.bone.hips.position.y;
  }

  update(dt: number, s: IsaacAnimState): void {
    const b = this.bones.bone;
    const W = sideSign(this.weapon);
    const R = 14; // pose blend rate
    this.time += dt;

    // Gait phase advances with distance, not time (stride ~1.3 m walking, longer sprinting)
    const stride = s.sprint ? 1.9 : 1.3;
    this.gaitPhase = (this.gaitPhase + ((s.speed * dt) / stride) * Math.PI * 2) % (Math.PI * 2);
    const amp = Math.min(1, s.speed / 3.8) * (s.sprint ? 0.75 : 0.5);
    const fwd = s.velocityLocal.z;
    const strafe = s.velocityLocal.x;
    const swing = Math.sin(this.gaitPhase);
    const dirSign = Math.abs(fwd) > 0.1 ? Math.sign(fwd) : 0.4;

    for (const side of ['L', 'R'] as Side[]) {
      const sign = side === this.weapon ? 1 : -1;
      const ph = swing * sign;
      const flex = Math.max(0, Math.cos(this.gaitPhase) * sign); // knee only flexes
      const thigh = b[`thigh.${side}`], shin = b[`shin.${side}`], foot = b[`foot.${side}`];
      thigh.rotation.x = damp(thigh.rotation.x, STANCE.thigh - ph * amp * dirSign, R, dt);
      thigh.rotation.z = damp(thigh.rotation.z, ph * amp * strafe * 0.35, R, dt);
      shin.rotation.x = damp(shin.rotation.x, STANCE.knee + flex * amp * 1.2, R, dt);
      foot.rotation.x = damp(foot.rotation.x, STANCE.ankle - flex * amp * 0.4, R, dt);

      // Shoulders rolled forward and dropped (y/z signs mirror per side)
      const sg = sideSign(side);
      const clav = b[`clavicle.${side}`];
      clav.rotation.y = damp(clav.rotation.y, -sg * STANCE.clavicleForward, R, dt);
      clav.rotation.z = damp(clav.rotation.z, -sg * STANCE.clavicleDrop, R, dt);
    }

    // Hips bob; spine lean, counter-rotation and breathing split over two bones
    const bob = Math.abs(Math.cos(this.gaitPhase)) * 0.05 * amp;
    b.hips.position.y = damp(b.hips.position.y, this.hipHeight - 0.004 - 0.02 * amp + bob, R, dt);
    const breathe = Math.sin(this.time * 1.7) * 0.015;
    const lean = (s.sprint ? 0.16 : 0.04 * Math.abs(fwd) * amp) + (s.aiming ? 0.04 : 0) - s.hurtT * 0.6 - (s.stasisT > 0 ? 0.05 : 0);
    b.spine1.rotation.x = damp(b.spine1.rotation.x, lean * 0.4 + breathe * 0.3, R, dt);
    b.spine2.rotation.x = damp(b.spine2.rotation.x, lean * 0.6 + breathe * 0.7, R, dt);
    b.spine2.rotation.y = damp(b.spine2.rotation.y, -swing * amp * 0.25 * Math.sign(fwd || 1), R, dt);
    b.neck.rotation.x = damp(b.neck.rotation.x, STANCE.neckForward, R, dt);
    b.head.rotation.x = damp(b.head.rotation.x, STANCE.headLevel - lean * 0.5 + s.hurtT * 0.5, R, dt);

    // Weapon arm: low-ready (elbow bent, forearm forward) or aim (arm extended).
    // The weapon itself is kept level by the model (see IsaacModel.alignWeapon).
    const wu = b[`upperarm.${this.weapon}`], wf = b[`forearm.${this.weapon}`];
    const shoulderX = s.aiming ? -1.5 : -0.45 + swing * amp * 0.12;
    wu.rotation.x = damp(wu.rotation.x, shoulderX - s.reloadT * 0.4, R, dt);
    // Aim: +0.09 cancels the forward-rolled clavicle so the extended arm stays beside the body
    wu.rotation.z = damp(wu.rotation.z, W * (s.aiming ? 0.09 : 0.22), R, dt);
    wf.rotation.x = damp(wf.rotation.x, s.aiming ? -0.07 : -1.1, R, dt);

    // Off arm (stasis): thrust, aim support, or relaxed with the hand in front of the thigh
    const ou = b[`upperarm.${this.off}`], of = b[`forearm.${this.off}`];
    let oX: number, oZ: number, oElbow: number, oIn: number;
    if (s.stasisT > 0) {
      oX = -1.45; oZ = W * 0.12; oElbow = -0.05; oIn = 0;
    } else if (s.aiming) {
      oX = -1.15; oZ = W * 0.55; oElbow = -0.55; oIn = 0;
    } else {
      oX = STANCE.offShoulderForward - swing * amp * 0.7 * Math.sign(fwd || 1);
      oZ = -W * STANCE.offAbduction;
      oElbow = STANCE.offElbow - amp * 0.3;
      oIn = W * STANCE.offForearmIn;
    }
    ou.rotation.x = damp(ou.rotation.x, oX, R, dt);
    ou.rotation.z = damp(ou.rotation.z, oZ, R, dt);
    of.rotation.x = damp(of.rotation.x, oElbow, R, dt);
    of.rotation.z = damp(of.rotation.z, oIn, R, dt);
  }
}
