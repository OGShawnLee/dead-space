import {
  Group,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  SpotLight,
  PointLight,
  Object3D,
  MeshBasicMaterial,
  MeshStandardMaterial,
  CanvasTexture,
  LinearFilter,
  DoubleSide,
  Vector3,
  Box3,
  type Scene
} from 'three';
import { TextureFactory } from '../graphics/TextureFactory';
import type { SoundSystem } from '../core/SoundSystem';
import type { InputState } from '../types';

/**
 * Isaac Clarke Player Entity
 * Features:
 * - 3D Prominent RIG Spinal Bar with 6 individual glowing neon vertebrae
 * - Back aura point light & Stasis meter (3 charges: Cyan -> Amber -> Red -> Dark)
 * - Plasma Cutter weapon rig with floating holographic ammo
 * - Shoulder-mounted high-intensity flashlight
 * - Smooth WASD movement, sprint, aiming posture, health/damage/healing
 * - Stasis Module left-arm thrust discharge
 * - Camera proximity occlusion fade (becomes transparent when camera is close)
 */
export class Player {
  scene: Scene;
  sound: SoundSystem;

  maxHp: number;
  hp: number;
  medkits: number;
  ammo: number;
  maxAmmo: number;
  reserveAmmo: number;
  isDead: boolean;

  // Stasis Module (Suit Level 1: 3 charges, 50% slow)
  stasisCharges: number;
  maxStasisCharges: number;
  stasisCooldown: number;
  stasisAnimTimer: number;

  isAiming: boolean;
  isSprinting: boolean;
  flashlightOn: boolean;
  stepTimer: number;
  heartbeatTimer: number;
  currentOpacity: number;

  // Movement speeds
  walkSpeed: number;
  sprintSpeed: number;
  aimSpeed: number;

  root: Group;
  radius: number;

  suitGroup!: Group;
  torsoMesh!: Mesh<BoxGeometry, MeshStandardMaterial>;
  rigSegments!: Mesh<BoxGeometry, MeshBasicMaterial>[];
  stasisRingMat!: MeshBasicMaterial;
  stasisRing!: Mesh<CylinderGeometry, MeshBasicMaterial>;
  rigBackLight!: PointLight;
  legL!: Mesh<BoxGeometry, MeshStandardMaterial>;
  legR!: Mesh<BoxGeometry, MeshStandardMaterial>;
  armL!: Mesh<BoxGeometry, MeshStandardMaterial>;
  armR!: Mesh<BoxGeometry, MeshStandardMaterial>;

  weaponGroup!: Group;
  ammoCanvas!: HTMLCanvasElement;
  ammoTexture!: CanvasTexture;
  holoScreen!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  laserLine!: Line<BufferGeometry, LineBasicMaterial>;

  spotLight!: SpotLight;
  spotTarget!: Object3D;

  constructor(scene: Scene, soundSystem: SoundSystem, startPos: Vector3) {
    this.scene = scene;
    this.sound = soundSystem;

    this.maxHp = 100;
    this.hp = 100;
    this.medkits = 2;
    this.ammo = 10;
    this.maxAmmo = 10;
    this.reserveAmmo = 30;
    this.isDead = false;

    // Stasis Module (Suit Level 1: 3 charges, 50% slow)
    this.stasisCharges = 3;
    this.maxStasisCharges = 3;
    this.stasisCooldown = 0;
    this.stasisAnimTimer = 0;

    this.isAiming = false;
    this.isSprinting = false;
    this.flashlightOn = true;
    this.stepTimer = 0;
    this.heartbeatTimer = 0;
    this.currentOpacity = 1.0;

    // Movement speeds
    this.walkSpeed = 3.8;
    this.sprintSpeed = 6.2;
    this.aimSpeed = 2.2;

    this.root = new Group();
    this.root.position.copy(startPos);
    this.scene.add(this.root);
    this.radius = 0.5;

    this.buildSuitMesh();
    this.buildPlasmaCutter();
    this.buildFlashlight();
    this.updateRigSpine();
    this.updateStasisMeter();
  }

  buildSuitMesh(): void {
    this.suitGroup = new Group();
    this.root.add(this.suitGroup);

    const suitMat = new MeshStandardMaterial({
      map: TextureFactory.createSuitTexture(),
      roughness: 0.45,
      metalness: 0.65
    });

    const darkMetalMat = new MeshStandardMaterial({
      color: 0x1f242b,
      roughness: 0.7,
      metalness: 0.8
    });

    // 1. Torso
    const torsoGeo = new BoxGeometry(0.65, 0.75, 0.4);
    this.torsoMesh = new Mesh(torsoGeo, suitMat);
    this.torsoMesh.position.y = 1.15;
    this.torsoMesh.castShadow = true;
    this.suitGroup.add(this.torsoMesh);

    // Chest armor plate
    const chestPlate = new Mesh(
      new BoxGeometry(0.55, 0.4, 0.1),
      darkMetalMat
    );
    chestPlate.position.set(0, 1.25, 0.22);
    this.suitGroup.add(chestPlate);

    // 2. Helmet
    const helmetGeo = new BoxGeometry(0.4, 0.42, 0.42);
    const helmet = new Mesh(helmetGeo, suitMat);
    helmet.position.set(0, 1.72, 0);
    this.suitGroup.add(helmet);

    // Glowing cyan visor slits
    const visorMat = new MeshBasicMaterial({ color: 0x00f0ff });
    for (let i = 0; i < 3; i++) {
      const slit = new Mesh(
        new BoxGeometry(0.24, 0.025, 0.05),
        visorMat
      );
      slit.position.set(0, 1.74 - i * 0.05, 0.215);
      this.suitGroup.add(slit);
    }

    // 3. PROMINENT 3D DEAD SPACE RIG SPINAL ASSEMBLY
    const pack = new Mesh(new BoxGeometry(0.38, 0.68, 0.12), darkMetalMat);
    pack.position.set(0, 1.15, -0.26);
    this.suitGroup.add(pack);

    // Spine mounting bracket
    const spineBracket = new Mesh(
      new BoxGeometry(0.14, 0.62, 0.06),
      darkMetalMat
    );
    spineBracket.position.set(0, 1.15, -0.32);
    this.suitGroup.add(spineBracket);

    // 6 Segmented 3D vertebrae with distinct neon glow
    this.rigSegments = [];
    const numSegments = 6;
    const segH = 0.07;
    const segGap = 0.025;
    const startY = 0.88;

    for (let i = 0; i < numSegments; i++) {
      const segGeo = new BoxGeometry(0.09, segH, 0.12);
      const segMat = new MeshBasicMaterial({
        color: 0x00f0ff
      });
      const segMesh = new Mesh(segGeo, segMat);
      segMesh.position.set(0, startY + i * (segH + segGap), -0.36);
      this.suitGroup.add(segMesh);
      this.rigSegments.push(segMesh);
    }

    // Circular Stasis Meter on right shoulder blade
    this.stasisRingMat = new MeshBasicMaterial({ color: 0x00f0ff });
    this.stasisRing = new Mesh(
      new CylinderGeometry(0.065, 0.065, 0.04, 16),
      this.stasisRingMat
    );
    this.stasisRing.rotation.x = Math.PI / 2;
    this.stasisRing.position.set(0.18, 1.4, -0.32);
    this.suitGroup.add(this.stasisRing);

    // Dedicated Neon Back Light for the RIG Spine Aura
    this.rigBackLight = new PointLight(0x00f0ff, 1.5, 2.5);
    this.rigBackLight.position.set(0, 1.15, -0.45);
    this.suitGroup.add(this.rigBackLight);

    // 4. Limbs
    const legGeo = new BoxGeometry(0.24, 0.75, 0.24);
    this.legL = new Mesh(legGeo, suitMat);
    this.legL.position.set(-0.2, 0.4, 0);
    this.suitGroup.add(this.legL);

    this.legR = new Mesh(legGeo, suitMat);
    this.legR.position.set(0.2, 0.4, 0);
    this.suitGroup.add(this.legR);

    const armGeo = new BoxGeometry(0.2, 0.65, 0.2);
    this.armL = new Mesh(armGeo, suitMat);
    this.armL.position.set(-0.45, 1.15, 0);
    this.suitGroup.add(this.armL);

    this.armR = new Mesh(armGeo, suitMat);
    this.armR.position.set(0.45, 1.15, 0);
    this.suitGroup.add(this.armR);
  }

  setProximityOpacity(targetOpacity: number): void {
    if (Math.abs(this.currentOpacity - targetOpacity) < 0.01) return;
    this.currentOpacity = targetOpacity;

    const applyOpacity = (obj: any): void => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat: any) => {
          mat.transparent = targetOpacity < 0.99;
          mat.opacity = targetOpacity;
          mat.needsUpdate = true;
        });
      }
    };

    if (this.suitGroup) this.suitGroup.traverse(applyOpacity);
    if (this.weaponGroup) this.weaponGroup.traverse(applyOpacity);
  }

  buildPlasmaCutter(): void {
    this.weaponGroup = new Group();
    this.weaponGroup.position.set(0.48, 1.05, 0.35);

    const metalMat = new MeshStandardMaterial({
      color: 0x333b45,
      metalness: 0.8,
      roughness: 0.3
    });

    const body = new Mesh(new BoxGeometry(0.12, 0.16, 0.45), metalMat);
    this.weaponGroup.add(body);

    const emitter = new Mesh(
      new CylinderGeometry(0.05, 0.05, 0.12, 8),
      new MeshBasicMaterial({ color: 0x00e5ff })
    );
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0, 0.24);
    this.weaponGroup.add(emitter);

    // Floating Holographic Ammo Counter Screen (Dead Space diegetic UI)
    this.ammoCanvas = TextureFactory.createHoloAmmoCanvas(this.ammo, this.maxAmmo);
    this.ammoTexture = new CanvasTexture(this.ammoCanvas);
    this.ammoTexture.magFilter = LinearFilter;
    this.ammoTexture.minFilter = LinearFilter;

    const holoScreenGeo = new PlaneGeometry(0.26, 0.13);
    const holoScreenMat = new MeshBasicMaterial({
      map: this.ammoTexture,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide
    });
    this.holoScreen = new Mesh(holoScreenGeo, holoScreenMat);
    this.holoScreen.position.set(0.14, 0.16, -0.06);
    this.holoScreen.rotation.y = -Math.PI / 3.8;
    this.holoScreen.rotation.x = -Math.PI / 12;
    this.weaponGroup.add(this.holoScreen);

    // Subtle cyan holographic glow light
    const holoLight = new PointLight(0x00e5ff, 0.4, 0.8);
    holoLight.position.copy(this.holoScreen.position);
    this.weaponGroup.add(holoLight);

    // 3 Aiming Lasers
    const laserMat = new LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });
    const laserGeom = new BufferGeometry().setFromPoints([
      new Vector3(0, 0, 0),
      new Vector3(0, 0, 25)
    ]);
    this.laserLine = new Line(laserGeom, laserMat);
    this.laserLine.position.set(0, 0, 0.24);
    this.laserLine.visible = false;
    this.weaponGroup.add(this.laserLine);

    this.suitGroup.add(this.weaponGroup);
  }

  buildFlashlight(): void {
    this.spotLight = new SpotLight(0xd4e9ff, 4.5, 30, Math.PI / 6, 0.35, 1.2);
    this.spotLight.position.set(0.28, 1.62, 0.15);
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.spotLight.shadow.camera.near = 0.5;
    this.spotLight.shadow.camera.far = 30;

    this.spotTarget = new Object3D();
    this.spotTarget.position.set(0.28, 1.62, 10);
    this.root.add(this.spotTarget);
    this.spotLight.target = this.spotTarget;

    this.suitGroup.add(this.spotLight);
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

    let segColor = 0x00f0ff; // Full Cyan
    if (healthFrac <= 0.25) segColor = 0xff2222; // Critical Red
    else if (healthFrac <= 0.6) segColor = 0xff9900; // Warning Amber

    this.rigSegments.forEach((mesh, idx) => {
      if (idx < activeSegments) {
        mesh.material.color.setHex(segColor);
        mesh.visible = true;
      } else {
        mesh.material.color.setHex(0x151c24);
      }
    });

    if (this.rigBackLight) {
      this.rigBackLight.color.setHex(segColor);
      this.rigBackLight.intensity = healthFrac > 0.25 ? 1.5 : 2.5;
    }

    const segmentsEl = document.getElementById('rig-segments');
    if (segmentsEl) {
      const segDoms = segmentsEl.querySelectorAll('.segment');
      segDoms.forEach((dom, i) => {
        dom.className = 'segment';
        if (i < activeSegments) {
          if (healthFrac > 0.6) dom.classList.add('active');
          else if (healthFrac > 0.25) dom.classList.add('warn');
          else dom.classList.add('crit');
        }
      });
    }

    const hpNumEl = document.getElementById('hud-hp-val');
    if (hpNumEl) hpNumEl.textContent = `${Math.round(this.hp)}%`;
  }

  updateStasisMeter(): void {
    if (!this.stasisRingMat) return;
    if (this.stasisCharges >= 3) {
      this.stasisRingMat.color.setHex(0x00f0ff); // Full 3 charges: Brilliant cyan
    } else if (this.stasisCharges === 2) {
      this.stasisRingMat.color.setHex(0xff9900); // 2 charges: Amber orange
    } else if (this.stasisCharges === 1) {
      this.stasisRingMat.color.setHex(0xff2a2a); // 1 charge: Critical red
    } else {
      this.stasisRingMat.color.setHex(0x181e26); // 0 charges: Depleted dark
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
      ctx.clearRect(0, 0, 256, 128);
      ctx.drawImage(newCanvas, 0, 0);
    }
    this.ammoTexture.needsUpdate = true;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.updateRigSpine();
    this.sound.playPlayerHurt();

    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 120);
    }

    if (this.hp <= 0) {
      this.isDead = true;
      this.suitGroup.rotation.x = -Math.PI / 2.2;
      this.suitGroup.position.y = 0.2;
    }
  }

  heal(): boolean {
    if (this.medkits <= 0 || this.hp >= this.maxHp || this.isDead) return false;
    this.medkits--;
    this.hp = Math.min(this.maxHp, this.hp + 50);
    this.updateRigSpine();
    this.sound.playMedkit();
    return true;
  }

  reload(): boolean {
    if (this.ammo >= this.maxAmmo || this.reserveAmmo <= 0) return false;
    const needed = this.maxAmmo - this.ammo;
    const toLoad = Math.min(needed, this.reserveAmmo);
    this.ammo += toLoad;
    this.reserveAmmo -= toLoad;
    this.updateHoloAmmo();
    this.sound.playReload();
    return true;
  }

  update(dt: number, input: InputState, colliders: Box3[]): void {
    if (this.isDead) return;

    this.isAiming = input.aiming;
    this.laserLine.visible = this.isAiming;

    this.stasisCooldown = Math.max(0, this.stasisCooldown - dt);

    if (this.isAiming) {
      this.weaponGroup.position.set(0.3, 1.35, 0.6);
      this.armR.position.set(0.3, 1.35, 0.3);
      this.armR.rotation.x = -Math.PI / 2.2;
    } else {
      this.weaponGroup.position.set(0.48, 1.05, 0.35);
      this.armR.position.set(0.45, 1.15, 0);
      this.armR.rotation.x = 0;
    }

    // Left Arm positioning: Stasis discharge gesture or aim support pose
    if (this.stasisAnimTimer > 0) {
      this.stasisAnimTimer -= dt;
      this.armL.position.set(-0.35, 1.35, 0.35);
      this.armL.rotation.x = -Math.PI / 2.2;
    } else if (this.isAiming) {
      this.armL.position.set(-0.35, 1.2, 0.15);
      this.armL.rotation.x = -Math.PI / 4.5;
    } else {
      this.armL.position.set(-0.45, 1.15, 0);
    }

    // 1-charge critical warning pulse on the spine ring
    if (this.stasisCharges === 1 && this.stasisRingMat) {
      const pulse = 0.65 + Math.sin(Date.now() * 0.015) * 0.35;
      this.stasisRingMat.color.setRGB(pulse, 0.1, 0.1);
    }

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

      const sway = Math.sin(Date.now() * 0.01 * (input.sprint ? 1.4 : 1.0)) * 0.4;
      this.legL.rotation.x = sway;
      this.legR.rotation.x = -sway;
      if (!this.isAiming && this.stasisAnimTimer <= 0) {
        this.armL.rotation.x = -sway * 0.7;
      }
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      if (!this.isAiming && this.stasisAnimTimer <= 0) this.armL.rotation.x = 0;
    }

    if (this.hp <= 25 && this.rigBackLight) {
      const pulse = 0.8 + Math.sin(Date.now() * 0.015) * 0.7;
      this.rigBackLight.intensity = Math.max(0.2, pulse);
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
