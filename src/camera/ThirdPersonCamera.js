const THREE = window.THREE;

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
  constructor(camera, player, scene, domElement) {
    this.camera = camera;
    this.player = player;
    this.scene = scene;
    this.domElement = domElement;

    this.yaw = 0;
    this.pitch = 0;
    this.minPitch = -Math.PI / 3.0;
    this.maxPitch = Math.PI / 3.5;

    this.normalOffset = new THREE.Vector3(0.65, 1.6, -2.4);
    this.aimOffset = new THREE.Vector3(0.5, 1.5, -1.35);
    this.currentOffset = this.normalOffset.clone();

    this.normalFov = 70;
    this.aimFov = 50;

    // Configurable settings
    this.invertY = false;
    this.invertX = false;
    this.sensitivityMultiplier = 1.0;

    this.isLocked = false;
    this.setupPointerLock();
  }

  setSettings(settings) {
    if (!settings) return;
    if (typeof settings.invertY === 'boolean') this.invertY = settings.invertY;
    if (typeof settings.invertX === 'boolean') this.invertX = settings.invertX;
    if (typeof settings.sensitivity === 'number') this.sensitivityMultiplier = settings.sensitivity;
  }

  setupPointerLock() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.player.isDead) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
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

  update(dt, colliders) {
    const targetOffset = this.player.isAiming ? this.aimOffset : this.normalOffset;
    const targetFov = this.player.isAiming ? this.aimFov : this.normalFov;

    this.currentOffset.lerp(targetOffset, dt * 10);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 8);
    this.camera.updateProjectionMatrix();

    const headPos = this.player.root.position.clone().add(new THREE.Vector3(0, 1.45, 0));

    const rotOffset = this.currentOffset.clone();
    rotOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    rotOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const desiredCamPos = headPos.clone().add(rotOffset);

    const rayDir = new THREE.Vector3().subVectors(desiredCamPos, headPos);
    const dist = rayDir.length();
    rayDir.normalize();

    let actualCamPos = desiredCamPos;
    const hitPoint = new THREE.Vector3();
    const ray = new THREE.Ray(headPos, rayDir);

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
    const targetAlpha = THREE.MathUtils.clamp(
      (distToHead - minFadeDist) / (maxFadeDist - minFadeDist),
      0.15,
      1.0
    );
    this.player.setProximityOpacity(targetAlpha);

    const lookTarget = headPos.clone().add(
      new THREE.Vector3(0, 0, 10)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
    );
    this.camera.lookAt(lookTarget);
  }
}
