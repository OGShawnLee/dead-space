const THREE = window.THREE;
import { TextureFactory } from '../graphics/TextureFactory.js';

/**
 * Isaac Clarke Player Entity
 * Features:
 * - 3D Prominent RIG Spinal Bar with 6 individual glowing neon vertebrae
 * - Back aura point light & Stasis meter
 * - Plasma Cutter weapon rig with floating holographic ammo
 * - Shoulder-mounted high-intensity flashlight
 * - Smooth WASD movement, sprint, aiming posture, health/damage/healing
 */
export class Player {
  constructor(scene, soundSystem, startPos) {
    this.scene = scene;
    this.sound = soundSystem;

    this.maxHp = 100;
    this.hp = 100;
    this.medkits = 2;
    this.ammo = 10;
    this.maxAmmo = 10;
    this.reserveAmmo = 30;
    this.isDead = false;

    this.isAiming = false;
    this.isSprinting = false;
    this.flashlightOn = true;
    this.stepTimer = 0;
    this.heartbeatTimer = 0;

    // Movement speeds
    this.walkSpeed = 3.8;
    this.sprintSpeed = 6.2;
    this.aimSpeed = 2.2;

    this.root = new THREE.Group();
    this.root.position.copy(startPos);
    this.scene.add(this.root);
    this.radius = 0.5;

    this.buildSuitMesh();
    this.buildPlasmaCutter();
    this.buildFlashlight();
    this.updateRigSpine();
  }

  buildSuitMesh() {
    this.suitGroup = new THREE.Group();
    this.root.add(this.suitGroup);

    const suitMat = new THREE.MeshStandardMaterial({
      map: TextureFactory.createSuitTexture(),
      roughness: 0.45,
      metalness: 0.65
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1f242b,
      roughness: 0.7,
      metalness: 0.8
    });

    // 1. Torso
    const torsoGeo = new THREE.BoxGeometry(0.65, 0.75, 0.4);
    this.torsoMesh = new THREE.Mesh(torsoGeo, suitMat);
    this.torsoMesh.position.y = 1.15;
    this.torsoMesh.castShadow = true;
    this.suitGroup.add(this.torsoMesh);

    // Chest armor plate
    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.4, 0.1),
      darkMetalMat
    );
    chestPlate.position.set(0, 1.25, 0.22);
    this.suitGroup.add(chestPlate);

    // 2. Helmet
    const helmetGeo = new THREE.BoxGeometry(0.4, 0.42, 0.42);
    const helmet = new THREE.Mesh(helmetGeo, suitMat);
    helmet.position.set(0, 1.72, 0);
    this.suitGroup.add(helmet);

    // Glowing cyan visor slits
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    for (let i = 0; i < 3; i++) {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.035, 0.05),
        visorMat
      );
      slit.position.set(0, 1.76 - i * 0.06, 0.21);
      this.suitGroup.add(slit);
    }

    // 3. PROMINENT 3D DEAD SPACE RIG SPINAL ASSEMBLY
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.68, 0.12), darkMetalMat);
    pack.position.set(0, 1.15, -0.26);
    this.suitGroup.add(pack);

    // Spine mounting bracket
    const spineBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.62, 0.06),
      darkMetalMat
    );
    spineBracket.position.set(0, 1.15, -0.32);
    this.suitGroup.add(spineBracket);

    // 6 Segmented 3D vertebrae with distinct neon glow
    this.rigSegments = [];
    const segH = 0.075;
    const segGap = 0.02;
    const startY = 0.88;

    for (let i = 0; i < 6; i++) {
      const segGeo = new THREE.BoxGeometry(0.11, segH, 0.08);
      const segMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff
      });
      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.position.set(0, startY + i * (segH + segGap), -0.36);
      this.suitGroup.add(segMesh);
      this.rigSegments.push(segMesh);
    }

    // Circular Stasis Meter on right shoulder blade
    const stasisRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.04, 16),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );
    stasisRing.rotation.x = Math.PI / 2;
    stasisRing.position.set(0.18, 1.4, -0.32);
    this.suitGroup.add(stasisRing);

    // Dedicated Neon Back Light for the RIG Spine Aura
    this.rigBackLight = new THREE.PointLight(0x00f0ff, 1.5, 2.5);
    this.rigBackLight.position.set(0, 1.15, -0.45);
    this.suitGroup.add(this.rigBackLight);

    // 4. Limbs
    const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.24);
    this.legL = new THREE.Mesh(legGeo, suitMat);
    this.legL.position.set(-0.2, 0.4, 0);
    this.suitGroup.add(this.legL);

    this.legR = new THREE.Mesh(legGeo, suitMat);
    this.legR.position.set(0.2, 0.4, 0);
    this.suitGroup.add(this.legR);

    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
    this.armL = new THREE.Mesh(armGeo, suitMat);
    this.armL.position.set(-0.45, 1.15, 0);
    this.suitGroup.add(this.armL);

    this.armR = new THREE.Mesh(armGeo, suitMat);
    this.armR.position.set(0.45, 1.15, 0);
    this.suitGroup.add(this.armR);
  }

  buildPlasmaCutter() {
    this.weaponGroup = new THREE.Group();
    this.weaponGroup.position.set(0.48, 1.05, 0.35);

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x333b45,
      metalness: 0.8,
      roughness: 0.3
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.45), metalMat);
    this.weaponGroup.add(body);

    const emitter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0, 0.24);
    this.weaponGroup.add(emitter);

    this.ammoCanvas = TextureFactory.createHoloAmmoCanvas(this.ammo, this.maxAmmo);
    this.ammoTexture = new THREE.CanvasTexture(this.ammoCanvas);
    // Scaled up holographic projection for crystal-clear readability
    const holoGeo = new THREE.PlaneGeometry(0.52, 0.27);
    this.holoMaterial = new THREE.MeshBasicMaterial({
      map: this.ammoTexture,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    this.holoAmmoMesh = new THREE.Mesh(holoGeo, this.holoMaterial);
    this.holoAmmoMesh.position.set(0.28, 0.24, -0.05);
    this.holoAmmoMesh.rotation.y = -Math.PI / 6;
    this.weaponGroup.add(this.holoAmmoMesh);

    const laserMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.7,
      linewidth: 2
    });
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.24),
      new THREE.Vector3(0, 0, 25)
    ]);
    this.laserLine = new THREE.Line(laserGeo, laserMat);
    this.laserLine.visible = false;
    this.weaponGroup.add(this.laserLine);

    this.suitGroup.add(this.weaponGroup);
  }

  buildFlashlight() {
    this.spotLight = new THREE.SpotLight(0xf0f6ff, 3.2, 30, Math.PI / 6.5, 0.35, 1.2);
    this.spotLight.position.set(0.35, 1.55, 0.2);
    this.spotLight.castShadow = true;

    this.lightTarget = new THREE.Object3D();
    this.lightTarget.position.set(0.35, 1.55, 15);
    this.root.add(this.lightTarget);
    this.spotLight.target = this.lightTarget;

    this.root.add(this.spotLight);
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.spotLight.intensity = this.flashlightOn ? 3.2 : 0;
    this.sound.playFlashlight();
    return this.flashlightOn;
  }

  updateRigSpine() {
    const totalSegs = 6;
    const activeCount = Math.ceil((this.hp / 100) * totalSegs);

    let activeHex = 0x00f0ff;
    let hudClass = 'active';

    if (this.hp <= 25) {
      activeHex = 0xff1a1a;
      hudClass = 'active critical';
    } else if (this.hp <= 50) {
      activeHex = 0xffaa00;
      hudClass = 'active warning';
    }

    this.rigSegments.forEach((mesh, idx) => {
      if (idx < activeCount) {
        mesh.material.color.setHex(activeHex);
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    });

    if (this.rigBackLight) {
      this.rigBackLight.color.setHex(activeHex);
      this.rigBackLight.intensity = activeCount > 0 ? 1.5 : 0;
    }

    const hudContainer = document.getElementById('hud-rig-segments');
    if (hudContainer) {
      const segElements = hudContainer.querySelectorAll('.segment');
      segElements.forEach((el, idx) => {
        if (idx < activeCount) {
          el.className = `segment ${hudClass}`;
        } else {
          el.className = 'segment';
        }
      });
    }

    const hpVal = document.getElementById('hud-hp-val');
    if (hpVal) {
      hpVal.textContent = `${Math.round(this.hp)}%`;
      hpVal.style.color = `#${activeHex.toString(16).padStart(6, '0')}`;
    }
  }

  updateHoloAmmo() {
    const newCanvas = TextureFactory.createHoloAmmoCanvas(this.ammo, this.maxAmmo);
    const ctx = this.ammoCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.drawImage(newCanvas, 0, 0);
    this.ammoTexture.needsUpdate = true;
  }

  takeDamage(amount) {
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

  heal() {
    if (this.medkits <= 0 || this.hp >= this.maxHp || this.isDead) return false;
    this.medkits--;
    this.hp = Math.min(this.maxHp, this.hp + 50);
    this.updateRigSpine();
    this.sound.playMedkit();
    return true;
  }

  reload() {
    if (this.ammo >= this.maxAmmo || this.reserveAmmo <= 0) return false;
    const needed = this.maxAmmo - this.ammo;
    const toLoad = Math.min(needed, this.reserveAmmo);
    this.ammo += toLoad;
    this.reserveAmmo -= toLoad;
    this.updateHoloAmmo();
    this.sound.playReload();
    return true;
  }

  update(dt, input, colliders) {
    if (this.isDead) return;

    this.isAiming = input.aiming;
    this.laserLine.visible = this.isAiming;

    if (this.isAiming) {
      this.weaponGroup.position.set(0.3, 1.35, 0.6);
      this.armR.position.set(0.3, 1.35, 0.3);
      this.armR.rotation.x = -Math.PI / 2.2;
    } else {
      this.weaponGroup.position.set(0.48, 1.05, 0.35);
      this.armR.position.set(0.45, 1.15, 0);
      this.armR.rotation.x = 0;
    }

    let speed = this.walkSpeed;
    if (this.isAiming) speed = this.aimSpeed;
    else if (input.sprint) speed = this.sprintSpeed;

    const moveDir = new THREE.Vector3();
    if (input.forward) moveDir.z += 1;
    if (input.backward) moveDir.z -= 1;
    if (input.strafeLeft) moveDir.x += 1;
    if (input.strafeRight) moveDir.x -= 1;

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize();

      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);

      const deltaPos = new THREE.Vector3()
        .addScaledVector(forward, moveDir.z)
        .addScaledVector(right, moveDir.x)
        .multiplyScalar(speed * dt);

      const nextX = this.root.position.x + deltaPos.x;
      const nextZ = this.root.position.z + deltaPos.z;

      const testBoxX = new THREE.Box3(
        new THREE.Vector3(nextX - this.radius, 0.1, this.root.position.z - this.radius),
        new THREE.Vector3(nextX + this.radius, 1.8, this.root.position.z + this.radius)
      );
      let hitX = false;
      for (let i = 0; i < colliders.length; i++) {
        if (testBoxX.intersectsBox(colliders[i])) { hitX = true; break; }
      }
      if (!hitX) this.root.position.x = nextX;

      const testBoxZ = new THREE.Box3(
        new THREE.Vector3(this.root.position.x - this.radius, 0.1, nextZ - this.radius),
        new THREE.Vector3(this.root.position.x + this.radius, 1.8, nextZ + this.radius)
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
      if (!this.isAiming) {
        this.armL.rotation.x = -sway * 0.7;
      }
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      if (!this.isAiming) this.armL.rotation.x = 0;
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
