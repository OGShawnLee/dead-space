import {
  Group,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  TorusGeometry,
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
import { Inventory } from '../inventory/Inventory';

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

  root = new Group();
  radius = 0.5;

  suitGroup!: Group;
  torsoMesh!: Mesh<BoxGeometry, MeshStandardMaterial>;
  rigSegments!: Mesh<BoxGeometry, MeshBasicMaterial>[];
  stasisPlate!: Mesh<BoxGeometry, MeshStandardMaterial>;
  stasisSegments: Mesh<TorusGeometry, MeshBasicMaterial>[] = [];
  stasisSegmentMats: MeshBasicMaterial[] = [];
  stasisLight!: PointLight;
  rigBackLight!: PointLight;
  legL!: Mesh<BoxGeometry, MeshStandardMaterial>;
  legR!: Mesh<BoxGeometry, MeshStandardMaterial>;
  armL!: Mesh<BoxGeometry, MeshStandardMaterial>;
  armR!: Mesh<BoxGeometry, MeshStandardMaterial>;

  weaponGroup!: Group;
  ammoCanvas!: HTMLCanvasElement;
  ammoTexture!: CanvasTexture;
  holoScreen!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  holoLight!: PointLight;
  laserLine!: Line<BufferGeometry, LineBasicMaterial>;

  spotLight!: SpotLight;
  spotTarget!: Object3D;

  constructor(public scene: Scene, public sound: SoundSystem, startPos: Vector3) {
    this.root.position.copy(startPos);
    this.scene.add(this.root);

    // Starting loadout
    this.inventory.add('plasma_cutter', 1);
    this.inventory.add('plasma_energy', 30);
    this.inventory.add('med_small', 2);

    this.buildSuitMesh();
    this.buildPlasmaCutter();
    this.buildFlashlight();
    this.updateRigSpine();
    this.updateStasisMeter();
    this.updateHoloAmmo();
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

    // Extended RIG Shoulder Platform / Bracket for Stasis Module (as in Dead Space 1)
    this.stasisPlate = new Mesh(
      new BoxGeometry(0.18, 0.22, 0.09),
      darkMetalMat
    );
    this.stasisPlate.position.set(0.17, 1.38, -0.28);
    this.suitGroup.add(this.stasisPlate);

    // Circular armored socket collar
    const socketGeo = new CylinderGeometry(0.078, 0.082, 0.025, 24);
    const socketMesh = new Mesh(socketGeo, darkMetalMat);
    socketMesh.rotation.x = Math.PI / 2;
    socketMesh.position.set(0.17, 1.38, -0.33);
    this.suitGroup.add(socketMesh);

    // Central mechanical node hub (circular metal cylinder)
    const nodeGeo = new CylinderGeometry(0.038, 0.040, 0.03, 24);
    const nodeMesh = new Mesh(nodeGeo, darkMetalMat);
    nodeMesh.rotation.x = Math.PI / 2;
    nodeMesh.position.set(0.17, 1.38, -0.35);
    this.suitGroup.add(nodeMesh);

    // Inner mechanical core detail / cap
    const nodePinGeo = new CylinderGeometry(0.016, 0.018, 0.012, 16);
    const nodePinMesh = new Mesh(nodePinGeo, suitMat);
    nodePinMesh.rotation.x = Math.PI / 2;
    nodePinMesh.position.set(0.17, 1.38, -0.366);
    this.suitGroup.add(nodePinMesh);

    // Recessed dark groove under circular light
    const grooveGeo = new TorusGeometry(0.058, 0.008, 8, 32);
    const grooveMat = new MeshStandardMaterial({
      color: 0x10141a,
      roughness: 0.85,
      metalness: 0.6
    });
    const grooveMesh = new Mesh(grooveGeo, grooveMat);
    grooveMesh.position.set(0.17, 1.38, -0.345);
    this.suitGroup.add(grooveMesh);

    // 3 Curved Luminous Arc Segments wrapping around the central node
    this.stasisSegments = [];
    this.stasisSegmentMats = [];
    const numStasisSegments = 3;
    const totalArc = Math.PI * 1.78; // ~320 degrees horseshoe
    const gap = 0.10; // Radian gap between segments
    const segArc = (totalArc - (numStasisSegments - 1) * gap) / numStasisSegments;
    const startOffsetAngle = Math.PI * 0.85; // Opening at upper-left towards neck

    for (let i = 0; i < numStasisSegments; i++) {
      const segGeo = new TorusGeometry(0.058, 0.0075, 8, 20, segArc);
      const segMat = new MeshBasicMaterial({ color: 0x00f0ff });
      const segMesh = new Mesh(segGeo, segMat);
      segMesh.position.set(0.17, 1.38, -0.355);
      segMesh.rotation.z = startOffsetAngle + i * (segArc + gap);
      this.suitGroup.add(segMesh);
      this.stasisSegments.push(segMesh);
      this.stasisSegmentMats.push(segMat);
    }

    // Dedicated PointLight for the Stasis Gauge (illuminates shoulder and environment)
    this.stasisLight = new PointLight(0x00f0ff, 1.4, 2.2);
    this.stasisLight.position.set(0.17, 1.38, -0.42);
    this.suitGroup.add(this.stasisLight);

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
      // Hologram UI and laser lines must ALWAYS remain transparent
      if (obj === this.holoScreen || obj === this.laserLine) {
        if (obj.material) {
          obj.material.transparent = true;
          obj.material.opacity = (obj === this.holoScreen ? 0.95 : 0.85) * targetOpacity;
          obj.material.needsUpdate = true;
        }
        return;
      }

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

    // Body
    const bodyGeo = new BoxGeometry(0.12, 0.18, 0.4);
    const body = new Mesh(bodyGeo, metalMat);
    this.weaponGroup.add(body);

    // Front emitter
    const emitterGeo = new CylinderGeometry(0.04, 0.04, 0.08, 8);
    const emitter = new Mesh(emitterGeo, metalMat);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0, 0.24);
    this.weaponGroup.add(emitter);

    // Floating Holographic Ammo Counter Screen (Dead Space diegetic UI)
    this.ammoCanvas = TextureFactory.createHoloAmmoCanvas(this.ammo, this.maxAmmo);
    this.ammoTexture = new CanvasTexture(this.ammoCanvas);
    this.ammoTexture.magFilter = LinearFilter;
    this.ammoTexture.minFilter = LinearFilter;

    // Larger dimensions for high clarity (0.38m x 0.19m)
    const holoScreenGeo = new PlaneGeometry(0.38, 0.19);
    const holoScreenMat = new MeshBasicMaterial({
      map: this.ammoTexture,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
      depthWrite: false,
      // Never clipped by Isaac's arm/torso; the screen is a projected overlay on the weapon
      depthTest: false
    });
    this.holoScreen = new Mesh(holoScreenGeo, holoScreenMat);
    // Directly perpendicular to X and Y axes of the gun, facing the player/camera
    this.holoScreen.position.set(0.17, 0.2, 0.0);
    this.holoScreen.rotation.set(0, Math.PI, 0);
    this.holoScreen.renderOrder = 10;
    this.weaponGroup.add(this.holoScreen);

    // Dynamic holographic glow light
    this.holoLight = new PointLight(0x00f0ff, 0.5, 1.5);
    this.holoLight.position.copy(this.holoScreen.position);
    this.weaponGroup.add(this.holoLight);

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
  }

  updateStasisMeter(): void {
    if (!this.stasisSegmentMats || this.stasisSegmentMats.length === 0) return;

    const unlitColor = 0x10141a;

    if (this.stasisCharges >= 3) {
      // 3 Charges: Full gauge, brilliant cyan
      for (let i = 0; i < 3; i++) {
        this.stasisSegmentMats[i].color.setHex(0x00f0ff);
        this.stasisSegmentMats[i].needsUpdate = true;
      }
      if (this.stasisLight) {
        this.stasisLight.color.setHex(0x00f0ff);
        this.stasisLight.intensity = 1.4;
      }
    } else if (this.stasisCharges === 2) {
      // 2 Charges: 2 segments active in amber, 3rd segment drained
      this.stasisSegmentMats[0].color.setHex(0xff9900);
      this.stasisSegmentMats[1].color.setHex(0xff9900);
      this.stasisSegmentMats[2].color.setHex(unlitColor);
      for (let i = 0; i < 3; i++) this.stasisSegmentMats[i].needsUpdate = true;

      if (this.stasisLight) {
        this.stasisLight.color.setHex(0xff9900);
        this.stasisLight.intensity = 1.1;
      }
    } else if (this.stasisCharges === 1) {
      // 1 Charge: 1 segment active in critical red, other 2 drained
      this.stasisSegmentMats[0].color.setHex(0xff2a2a);
      this.stasisSegmentMats[1].color.setHex(unlitColor);
      this.stasisSegmentMats[2].color.setHex(unlitColor);
      for (let i = 0; i < 3; i++) this.stasisSegmentMats[i].needsUpdate = true;

      if (this.stasisLight) {
        this.stasisLight.color.setHex(0xff2a2a);
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
      if (ratio <= 0.2) {
        this.holoLight.color.setHex(0xff2222);
      } else if (ratio <= 0.5) {
        this.holoLight.color.setHex(0xff9900);
      } else {
        this.holoLight.color.setHex(0x00f0ff);
      }
    }
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
