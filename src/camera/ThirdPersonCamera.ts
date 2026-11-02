import { PerspectiveCamera, Vector3, MathUtils, Ray, type Box3, type Scene } from 'three';
import type { Player } from '../entities/Player';
import type { CameraSettings } from '../types';

/**
 * Third-Person Over-the-Shoulder Camera Controller
 * Features:
 * - Smooth lerping behind Isaac's right shoulder
 * - Dynamic aim zoom (transitions FOV from 70 to 50)
 * - Pointer Lock handling
 * - Collision detection against walls to prevent camera clipping
 * - Configurable Axis Inversion (Invert Y / Invert X) and Sensitivity multiplier
 * - Proximity-based character occlusion fade in tight corridors/corners
 * - Inventory shot: Isaac slides to the left of the frame via a projection shift
 *   (no world-space movement, so walls cannot block it), plus an optional orbit
 *   toward his side that is only used if a collision-free pose exists.
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0;
  minPitch = -Math.PI / 3.0;
  maxPitch = Math.PI / 3.5;
  // 1: Original 2008 | 2: Espaciosa | 3: Remake 2023 | 4: Táctica
  static readonly PRESET: 1 | 2 | 3 | 4 = 4;

  normalOffset = [
    new Vector3(0.72, 0.15, -2.85), // Preset 1
    new Vector3(0.80, 0.20, -3.20), // Preset 2
    new Vector3(0.68, 0.08, -2.50), // Preset 3
    new Vector3(0.75, 0.28, -2.90)  // Preset 4
  ][ThirdPersonCamera.PRESET - 1];

  aimOffset = [
    new Vector3(0.85, 0.10, -1.65), // Preset 1
    new Vector3(0.90, 0.12, -1.80), // Preset 2
    new Vector3(0.82, 0.05, -1.45), // Preset 3
    new Vector3(0.88, 0.18, -1.60)  // Preset 4
  ][ThirdPersonCamera.PRESET - 1];

  currentOffset = this.normalOffset.clone();

  normalFov = [65, 68, 66, 67][ThirdPersonCamera.PRESET - 1];
  aimFov = [58, 60, 55, 57][ThirdPersonCamera.PRESET - 1];

  // Configurable settings
  invertY = false;
  invertX = false;
  sensitivityMultiplier = 1.0;

  isLocked = false;

  // ── Inventory shot (see proposal 003, section 3) ──
  /** Closer, slightly higher framing used while the inventory hologram is open. */
  inventoryOffset = new Vector3(0.55, 0.25, -2.4);
  inventoryFov = 55;
  /** Fraction of the viewport width Isaac is shifted to the left (projection shift). */
  static readonly SHOT_SHIFT = 0.2;
  /**
   * Candidate orbit angles (radians), tried in order. Positive swings the camera to the
   * side that makes Isaac face screen-right, toward the panel (verified numerically).
   */
  static readonly SHOT_ORBITS = [65, 50, 35, 20].map(d => (d * Math.PI) / 180);
  /** Extra clearance beyond the camera position that a pose must keep free. */
  static readonly SHOT_CLEARANCE = 0.4;
  inventoryShotActive = false;
  /** Eased 0..1 blend of the shot (drives shift, FOV, orbit). */
  private shotBlend = 0;
  /** Orbit angle chosen by the last probe (0 = projection shift only). */
  private shotOrbit = 0;

  constructor(
    public camera: PerspectiveCamera,
    public player: Player,
    public scene: Scene,
    public domElement: HTMLElement
  ) {
    this.setupPointerLock();
  }

  setSettings(settings?: CameraSettings | null): void {
    if (!settings) return;
    if (typeof settings.invertY === 'boolean') this.invertY = settings.invertY;
    if (typeof settings.invertX === 'boolean') this.invertX = settings.invertX;
    if (typeof settings.sensitivity === 'number') this.sensitivityMultiplier = settings.sensitivity;
  }

  setupPointerLock(): void {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.player.isDead) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isLocked || this.player.isDead || this.inventoryShotActive) return;

      const baseSensitivity = 0.0022;
      const sensitivity = baseSensitivity * this.sensitivityMultiplier;
      const dirX = this.invertX ? -1 : 1;
      const dirY = this.invertY ? -1 : 1;

      this.yaw -= e.movementX * sensitivity * dirX;
      this.pitch -= e.movementY * sensitivity * dirY;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

      this.player.root.rotation.y = this.yaw;
    });
  }

  /**
   * Enters / leaves the inventory shot. On entry, probes orbit poses against the
   * level colliders and keeps the first free one; if none is free the shot degrades
   * to the projection shift alone, which never needs space.
   */
  setInventoryShot(open: boolean, colliders: Box3[] = []): void {
    this.inventoryShotActive = open;
    if (!open) return;

    const headPos = this.player.root.position.clone().add(new Vector3(0, 1.45, 0));
    this.shotOrbit = 0;
    for (const orbit of ThirdPersonCamera.SHOT_ORBITS) {
      if (this.isPoseFree(headPos, orbit, colliders)) {
        this.shotOrbit = orbit;
        break;
      }
    }
  }

  private isPoseFree(headPos: Vector3, orbit: number, colliders: Box3[]): boolean {
    const offset = this.inventoryOffset.clone();
    offset.applyAxisAngle(new Vector3(0, 1, 0), this.yaw + orbit);
    const dist = offset.length();
    const ray = new Ray(headPos, offset.clone().normalize());
    const hit = new Vector3();
    for (const box of colliders) {
      if (ray.intersectBox(box, hit) && headPos.distanceTo(hit) < dist + ThirdPersonCamera.SHOT_CLEARANCE) {
        return false;
      }
    }
    // The camera body itself must also not start inside a collider
    const camPos = headPos.clone().add(offset);
    return !colliders.some(box => box.containsPoint(camPos));
  }

  /** Shifts the projection so Isaac sits left of center; cleared when fully closed. */
  private applyViewShift(): void {
    const w = this.domElement.clientWidth || window.innerWidth;
    const h = this.domElement.clientHeight || window.innerHeight;
    if (this.shotBlend < 0.001 && !this.inventoryShotActive) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    const ease = this.shotBlend * this.shotBlend * (3 - 2 * this.shotBlend);
    this.camera.setViewOffset(w, h, w * ThirdPersonCamera.SHOT_SHIFT * ease, 0, w, h);
  }

  update(dt: number, colliders: Box3[]): void {
    const shot = this.inventoryShotActive;
    this.shotBlend = MathUtils.clamp(this.shotBlend + (shot ? dt : -dt) * 3.2, 0, 1);
    const ease = this.shotBlend * this.shotBlend * (3 - 2 * this.shotBlend);

    const orbit = this.shotOrbit * ease;

    const aiming = this.player.isAiming && !shot;
    const targetOffset = shot ? this.inventoryOffset : aiming ? this.aimOffset : this.normalOffset;
    const targetFov = shot ? this.inventoryFov : aiming ? this.aimFov : this.normalFov;

    this.currentOffset.lerp(targetOffset, dt * 10);
    this.camera.fov = MathUtils.lerp(this.camera.fov, targetFov, dt * 8);
    this.camera.updateProjectionMatrix();

    const headPos = this.player.root.position.clone().add(new Vector3(0, 1.45, 0));

    // Effective angles: the shot only adds an orbit and levels the pitch; it never touches
    // this.yaw / this.pitch, so Isaac's facing and the player's aim stay intact.
    const yaw = this.yaw + orbit;
    const pitch = MathUtils.lerp(this.pitch, 0.06, ease);

    const rotOffset = this.currentOffset.clone();
    rotOffset.applyAxisAngle(new Vector3(1, 0, 0), pitch);
    rotOffset.applyAxisAngle(new Vector3(0, 1, 0), yaw);

    const desiredCamPos = headPos.clone().add(rotOffset);

    const rayDir = new Vector3().subVectors(desiredCamPos, headPos);
    const dist = rayDir.length();
    rayDir.normalize();

    let actualCamPos = desiredCamPos;
    const hitPoint = new Vector3();
    const ray = new Ray(headPos, rayDir);

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (ray.intersectBox(box, hitPoint)) {
        if (headPos.distanceTo(hitPoint) < dist) {
          actualCamPos = hitPoint.clone().sub(rayDir.clone().multiplyScalar(0.2));
          break;
        }
      }
    }

    this.camera.position.lerp(actualCamPos, dt * 16);

    // Dynamic proximity occlusion fade for Isaac in tight corners
    const distToHead = this.camera.position.distanceTo(headPos);
    const minFadeDist = 0.65;
    const maxFadeDist = 1.45;
    const targetAlpha = MathUtils.clamp(
      (distToHead - minFadeDist) / (maxFadeDist - minFadeDist),
      0.15,
      1.0
    );
    // The suit is what the inventory is about: never fade it while the shot is on
    this.player.setProximityOpacity(this.shotBlend > 0.001 ? 1.0 : targetAlpha);

    const lookTarget = headPos.clone().add(
      new Vector3(0, 0, 10)
        .applyAxisAngle(new Vector3(1, 0, 0), pitch)
        .applyAxisAngle(new Vector3(0, 1, 0), yaw)
    );
    this.camera.lookAt(lookTarget);
    this.applyViewShift();
  }
}
