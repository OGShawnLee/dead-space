import { Group, Vector3, Box3, type Scene } from 'three';
import { TextureFactory } from '../graphics/TextureFactory';
import type { SoundSystem } from '../core/SoundSystem';
import type { InputState } from '../types';
import { Inventory } from '../inventory/Inventory';
import { PALETTE } from '../graphics/Palette';
import { createAnimState, isaacModeFromQuery, type IsaacView } from './isaac/IsaacView';
import { IsaacModel } from './isaac/IsaacModel';
import { LegacyIsaac } from './isaac/LegacyIsaac';

/** Desaturated tech state color for a 0..1 level (ok > warn > crit). */
const rigState = (frac: number, warnAt: number, critAt: number): number =>
  frac <= critAt ? PALETTE.rig.crit : frac <= warnAt ? PALETTE.rig.warn : PALETTE.rig.ok;
/** Point lights use the lighter `glow` tone in the nominal state. */
const rigLight = (state: number): number => (state === PALETTE.rig.ok ? PALETTE.rig.glow : state);

/**
 * Isaac Clarke: gameplay state (health, ammo, stasis, inventory, movement, collisions).
 * Visuals and animation live in an `IsaacView` (`IsaacModel`, or `LegacyIsaac` with
 * `?isaac=legacy`); the members Engine and the camera use are getters into it.
 */
export class Player {
  /** Everything Isaac carries (ammo reserve, med packs, stasis packs, weapons). */
  inventory = new Inventory();
  maxHp = 100;
  hp = 100;
  ammo = 10;
  maxAmmo = 10;
  isDead = false;

  // Stasis Module (Suit Level 1: 3 charges, 50% slow)
  stasisCharges = 3;
  maxStasisCharges = 3;
  stasisCooldown = 0;
  stasisAnimTimer = 0;

  isAiming = false;
  isSprinting = false;
  flashlightOn = true;
  stepTimer = 0;
  heartbeatTimer = 0;
  currentOpacity = 1.0;

  // Movement speeds
  walkSpeed = 3.8;
  sprintSpeed = 6.2;
  aimSpeed = 2.2;

  /** Feet origin; `rotation.y` is the yaw set by the camera. The model faces +Z. */
  root = new Group();
  radius = 0.5;

  /** Visual model (geometry, tech lights, animation). */
  readonly model: IsaacView;
  /** Per-frame intent handed to the model. */
  private readonly anim = createAnimState();
  /** Visual-only gesture timers (seconds left). */
  private reloadAnimTimer = 0;
  private hurtAnimTimer = 0;

  constructor(public scene: Scene, public sound: SoundSystem, startPos: Vector3) {
    this.root.position.copy(startPos);
    this.scene.add(this.root);

    // Starting loadout
    this.inventory.add('plasma_cutter', 1);
    this.inventory.add('plasma_energy', 30);
    this.inventory.add('med_small', 2);

    const mode = isaacModeFromQuery();
    this.model = mode === 'legacy'
      ? new LegacyIsaac(this.root, this.ammo, this.maxAmmo)
      : new IsaacModel(this.root, this.ammo, this.maxAmmo, { scene, debug: mode === 'debug' });

    this.updateRigSpine();
    this.updateStasisMeter();
    this.updateHoloAmmo();
  }

  // Contract members (Proposal 005, section 2), delegated to the model
  get armL() { return this.model.armL; }
  get weaponGroup() { return this.model.weaponGroup; }
  get rigSegments() { return this.model.rigSegments; }
  get stasisSegmentMats() { return this.model.stasisSegmentMats; }
  get stasisLight() { return this.model.stasisLight; }
  get rigBackLight() { return this.model.rigBackLight; }
  get ammoCanvas() { return this.model.ammoCanvas; }
  get ammoTexture() { return this.model.ammoTexture; }
  get holoScreen() { return this.model.holoScreen; }
  get holoLight() { return this.model.holoLight; }
  get laserLine() { return this.model.laserLine; }
  get spotLight() { return this.model.spotLight; }
  get spotTarget() { return this.model.spotTarget; }

  setProximityOpacity(targetOpacity: number): void {
    this.model.setProximityOpacity(targetOpacity);
  }

  toggleFlashlight(): boolean {
    this.flashlightOn = !this.flashlightOn;
    this.spotLight.visible = this.flashlightOn;
    this.sound.playFlashlight();
    return this.flashlightOn;
  }

  updateRigSpine(): void {
    const healthFrac = this.hp / this.maxHp;
    const activeSegments = Math.ceil(healthFrac * this.rigSegments.length);

    const segColor = rigState(healthFrac, 0.6, 0.25);

    this.rigSegments.forEach((mesh, idx) => {
      if (idx < activeSegments) {
        mesh.material.color.setHex(segColor);
        mesh.visible = true;
      } else {
        mesh.material.color.setHex(PALETTE.rig.off);
      }
    });

    if (this.rigBackLight) {
      this.rigBackLight.color.setHex(rigLight(segColor));
      this.rigBackLight.intensity = healthFrac > 0.25 ? 1.5 : 2.5;
    }
  }

  updateStasisMeter(): void {
    if (!this.stasisSegmentMats || this.stasisSegmentMats.length === 0) return;

    const unlitColor = PALETTE.rig.off;

    if (this.stasisCharges >= 3) {
      // 3 Charges: full gauge, nominal
      for (let i = 0; i < 3; i++) {
        this.stasisSegmentMats[i].color.setHex(PALETTE.rig.ok);
        this.stasisSegmentMats[i].needsUpdate = true;
      }
      if (this.stasisLight) {
        this.stasisLight.color.setHex(PALETTE.rig.glow);
        this.stasisLight.intensity = 1.4;
      }
    } else if (this.stasisCharges === 2) {
      // 2 Charges: 2 segments in warn, 3rd segment drained
      this.stasisSegmentMats[0].color.setHex(PALETTE.rig.warn);
      this.stasisSegmentMats[1].color.setHex(PALETTE.rig.warn);
      this.stasisSegmentMats[2].color.setHex(unlitColor);
      for (let i = 0; i < 3; i++) this.stasisSegmentMats[i].needsUpdate = true;

      if (this.stasisLight) {
        this.stasisLight.color.setHex(PALETTE.rig.warn);
        this.stasisLight.intensity = 1.1;
      }
    } else if (this.stasisCharges === 1) {
      // 1 Charge: 1 segment in crit, other 2 drained
      this.stasisSegmentMats[0].color.setHex(PALETTE.rig.crit);
      this.stasisSegmentMats[1].color.setHex(unlitColor);
      this.stasisSegmentMats[2].color.setHex(unlitColor);
      for (let i = 0; i < 3; i++) this.stasisSegmentMats[i].needsUpdate = true;

      if (this.stasisLight) {
        this.stasisLight.color.setHex(PALETTE.rig.crit);
        this.stasisLight.intensity = 0.85;
      }
    } else {
      // 0 Charges: Completely empty gauge, dark
      for (let i = 0; i < 3; i++) {
        this.stasisSegmentMats[i].color.setHex(unlitColor);
        this.stasisSegmentMats[i].needsUpdate = true;
      }
      if (this.stasisLight) {
        this.stasisLight.intensity = 0.0;
      }
    }
  }

  canFireStasis(): boolean {
    return this.isAiming && !this.isDead && this.stasisCharges > 0 && this.stasisCooldown <= 0;
  }

  fireStasis(): boolean {
    if (!this.isAiming || this.isDead) return false;
    if (this.stasisCooldown > 0) return false;

    if (this.stasisCharges <= 0) {
      this.sound.playStasisEmpty();
      return false;
    }

    this.stasisCharges--;
    this.stasisCooldown = 0.9;
    this.stasisAnimTimer = 0.4;
    this.updateStasisMeter();
    this.sound.playStasisFire();
    return true;
  }

  rechargeStasis(amount = 3): void {
    this.stasisCharges = Math.min(this.maxStasisCharges, this.stasisCharges + amount);
    this.updateStasisMeter();
  }

  updateHoloAmmo(): void {
    const newCanvas = TextureFactory.createHoloAmmoCanvas(this.ammo, this.maxAmmo);
    const ctx = this.ammoCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, this.ammoCanvas.width, this.ammoCanvas.height);
      ctx.drawImage(newCanvas, 0, 0);
    }
    this.ammoTexture.needsUpdate = true;

    if (this.holoScreen && this.holoScreen.material) {
      this.holoScreen.material.transparent = true;
      this.holoScreen.material.needsUpdate = true;
    }

    if (this.holoLight) {
      const ratio = this.ammo / Math.max(1, this.maxAmmo);
      this.holoLight.color.setHex(rigLight(rigState(ratio, 0.5, 0.2)));
    }
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.updateRigSpine();
    this.sound.playPlayerHurt();
    this.hurtAnimTimer = 0.25;

    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 120);
    }

    if (this.hp <= 0) {
      this.isDead = true;
      this.model.playDeath();
    }
  }

  /** Reserve plasma cells, stored in the inventory. */
  get reserveAmmo(): number {
    return this.inventory.count('plasma_energy');
  }

  /** Effect of a med pack. Consumption is handled by the inventory. */
  applyHealing(amount: number): boolean {
    if (this.hp >= this.maxHp || this.isDead) return false;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateRigSpine();
    this.sound.playMedkit();
    return true;
  }

  reload(): boolean {
    if (this.ammo >= this.maxAmmo || this.reserveAmmo <= 0 || this.isDead) return false;
    const needed = this.maxAmmo - this.ammo;
    const toLoad = this.inventory.remove('plasma_energy', needed);
    this.ammo += toLoad;
    this.updateHoloAmmo();
    this.sound.playReload();
    this.reloadAnimTimer = 0.5;
    return true;
  }

  update(dt: number, input: InputState, colliders: Box3[]): void {
    if (this.isDead) return;

    this.isAiming = input.aiming;
    this.laserLine.visible = this.isAiming;

    this.stasisCooldown = Math.max(0, this.stasisCooldown - dt);
    this.stasisAnimTimer = Math.max(0, this.stasisAnimTimer - dt);
    this.reloadAnimTimer = Math.max(0, this.reloadAnimTimer - dt);
    this.hurtAnimTimer = Math.max(0, this.hurtAnimTimer - dt);

    let speed = this.walkSpeed;
    if (this.isAiming) speed = this.aimSpeed;
    else if (input.sprint) speed = this.sprintSpeed;

    const moveDir = new Vector3();
    if (input.forward) moveDir.z += 1;
    if (input.backward) moveDir.z -= 1;
    if (input.strafeLeft) moveDir.x += 1;
    if (input.strafeRight) moveDir.x -= 1;

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize();

      const forward = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), this.root.rotation.y);
      const right = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), this.root.rotation.y);

      const deltaPos = new Vector3()
        .addScaledVector(forward, moveDir.z)
        .addScaledVector(right, moveDir.x)
        .multiplyScalar(speed * dt);

      const nextX = this.root.position.x + deltaPos.x;
      const nextZ = this.root.position.z + deltaPos.z;

      const testBoxX = new Box3(
        new Vector3(nextX - this.radius, 0.1, this.root.position.z - this.radius),
        new Vector3(nextX + this.radius, 1.8, this.root.position.z + this.radius)
      );
      let hitX = false;
      for (let i = 0; i < colliders.length; i++) {
        if (testBoxX.intersectsBox(colliders[i])) { hitX = true; break; }
      }
      if (!hitX) this.root.position.x = nextX;

      const testBoxZ = new Box3(
        new Vector3(this.root.position.x - this.radius, 0.1, nextZ - this.radius),
        new Vector3(this.root.position.x + this.radius, 1.8, nextZ + this.radius)
      );
      let hitZ = false;
      for (let i = 0; i < colliders.length; i++) {
        if (testBoxZ.intersectsBox(colliders[i])) { hitZ = true; break; }
      }
      if (!hitZ) this.root.position.z = nextZ;

      this.stepTimer += dt * (input.sprint ? 1.6 : 1.0);
      if (this.stepTimer > 0.45) {
        this.stepTimer = 0;
        this.sound.playFootstep(input.sprint);
      }
    }

    const a = this.anim;
    a.velocityLocal.copy(moveDir);
    a.speed = isMoving ? speed : 0;
    a.speed01 = a.speed / this.sprintSpeed;
    a.sprint = isMoving && !this.isAiming && input.sprint;
    a.aiming = this.isAiming;
    a.stasisT = this.stasisAnimTimer;
    a.reloadT = this.reloadAnimTimer;
    a.hurtT = this.hurtAnimTimer;
    a.dead = this.isDead;
    a.flashlight = this.flashlightOn;
    this.model.update(dt, a);

    if (this.hp <= 25 && this.rigBackLight) {
      const pulse = 0.8 + Math.sin(Date.now() * 0.015) * 0.7;
      this.rigBackLight.intensity = Math.max(0.2, pulse);
    }

    // Low-stasis urgent pulse when down to 1 critical charge
    if (this.stasisCharges === 1 && this.stasisLight) {
      const pulse = 0.7 + Math.sin(Date.now() * 0.012) * 0.3;
      this.stasisLight.intensity = 0.85 * pulse;
    }

    if (this.hp <= 45) {
      const interval = this.hp <= 25 ? 0.6 : 1.1;
      this.heartbeatTimer += dt;
      if (this.heartbeatTimer > interval) {
        this.heartbeatTimer = 0;
        this.sound.playHeartbeatThump();
      }
    }
  }
}
