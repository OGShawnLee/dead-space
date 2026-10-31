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
      if (!this.isLocked || this.player.isDead) return;

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

  update(dt: number, colliders: Box3[]): void {
    const targetOffset = this.player.isAiming ? this.aimOffset : this.normalOffset;
    const targetFov = this.player.isAiming ? this.aimFov : this.normalFov;

    this.currentOffset.lerp(targetOffset, dt * 10);
    this.camera.fov = MathUtils.lerp(this.camera.fov, targetFov, dt * 8);
    this.camera.updateProjectionMatrix();

    const headPos = this.player.root.position.clone().add(new Vector3(0, 1.45, 0));

    const rotOffset = this.currentOffset.clone();
    rotOffset.applyAxisAngle(new Vector3(1, 0, 0), this.pitch);
    rotOffset.applyAxisAngle(new Vector3(0, 1, 0), this.yaw);

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
    this.player.setProximityOpacity(targetAlpha);

    const lookTarget = headPos.clone().add(
      new Vector3(0, 0, 10)
        .applyAxisAngle(new Vector3(1, 0, 0), this.pitch)
        .applyAxisAngle(new Vector3(0, 1, 0), this.yaw)
    );
    this.camera.lookAt(lookTarget);
  }
}
