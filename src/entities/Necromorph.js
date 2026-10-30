const THREE = window.THREE;
import { TextureFactory } from '../graphics/TextureFactory.js';
import { GibPart } from '../world/GibPart.js';
import { checkLineOfSight } from '../world/LineOfSight.js';

/**
 * Necromorph (Slasher) Entity
 * Features:
 * - Hierarchical limb system (Head, Torso, Left/Right Scythe Blades, Legs)
 * - Surgical dismemberment: 1 clean shot severs limbs
 * - Severing both arms completely DISARMS the enemy (0 attack damage, bleed-out)
 * - Severing both legs turns into crawler
 * - True Line of Sight (LoS) check through world obstacles (no wall-hacking)
 */
export class Necromorph {
  constructor(scene, soundSystem, spawnPos, gibList, bloodSys) {
    this.scene = scene;
    this.sound = soundSystem;
    this.gibList = gibList;
    this.bloodSys = bloodSys;

    this.hp = 120;
    this.isDead = false;
    this.state = 'PATROL';
    this.patrolTimer = 0;
    this.patrolDir = Math.random() * Math.PI * 2;

    this.baseSpeed = 2.6;
    this.speed = this.baseSpeed;
    this.attackRange = 1.65;
    this.attackCooldown = 0;
    this.bleedOutTimer = 0;

    // Limb Status Tracking
    this.hasHead = true;
    this.hasArmL = true;
    this.hasArmR = true;
    this.hasLegL = true;
    this.hasLegR = true;
    this.isCrawling = false;

    this.root = new THREE.Group();
    this.root.position.copy(spawnPos);
    this.scene.add(this.root);

    this.matSkin = new THREE.MeshStandardMaterial({
      map: TextureFactory.createNecroSkin(),
      roughness: 0.7,
      metalness: 0.15
    });

    this.matBlade = new THREE.MeshStandardMaterial({
      color: 0xd8c8b8,
      roughness: 0.3,
      metalness: 0.8
    });

    this.buildDeformedBody();
  }

  buildDeformedBody() {
    // 1. Torso
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.8, 0.35);
    this.torsoMesh = new THREE.Mesh(torsoGeo, this.matSkin);
    this.torsoMesh.position.y = 1.15;
    this.tagLimb(this.torsoMesh, 'torso', 999);
    this.root.add(this.torsoMesh);

    // 2. Head (HP: 25)
    const headGeo = new THREE.BoxGeometry(0.32, 0.38, 0.35);
    this.headMesh = new THREE.Mesh(headGeo, this.matSkin);
    this.headMesh.position.set(0, 0.58, 0);
    this.tagLimb(this.headMesh, 'head', 25);
    this.torsoMesh.add(this.headMesh);

    // 3. Left Slasher Arm & Blade (HP: 25)
    this.armLGroup = new THREE.Group();
    this.armLGroup.position.set(-0.4, 0.3, 0);
    const armUpperGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
    this.armLMesh = new THREE.Mesh(armUpperGeo, this.matSkin);
    this.armLMesh.position.y = -0.2;
    this.armLGroup.add(this.armLMesh);

    const bladeGeo = new THREE.ConeGeometry(0.12, 1.2, 4);
    bladeGeo.rotateX(Math.PI / 2.2);
    this.bladeLMesh = new THREE.Mesh(bladeGeo, this.matBlade);
    this.bladeLMesh.position.set(0, -0.45, 0.5);
    this.armLGroup.add(this.bladeLMesh);

    this.tagLimb(this.armLMesh, 'arm_left', 25);
    this.tagLimb(this.bladeLMesh, 'arm_left', 25);
    this.torsoMesh.add(this.armLGroup);

    // 4. Right Slasher Arm & Blade (HP: 25)
    this.armRGroup = new THREE.Group();
    this.armRGroup.position.set(0.4, 0.3, 0);
    this.armRMesh = new THREE.Mesh(armUpperGeo, this.matSkin);
    this.armRMesh.position.y = -0.2;
    this.armRGroup.add(this.armRMesh);

    this.bladeRMesh = new THREE.Mesh(bladeGeo, this.matBlade);
    this.bladeRMesh.position.set(0, -0.45, 0.5);
    this.armRGroup.add(this.bladeRMesh);

    this.tagLimb(this.armRMesh, 'arm_right', 25);
    this.tagLimb(this.bladeRMesh, 'arm_right', 25);
    this.torsoMesh.add(this.armRGroup);

    // 5. Left Leg (HP: 25)
    this.legLGroup = new THREE.Group();
    this.legLGroup.position.set(-0.2, -0.4, 0);
    const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    this.legLMesh = new THREE.Mesh(legGeo, this.matSkin);
    this.legLMesh.position.y = -0.35;
    this.tagLimb(this.legLMesh, 'leg_left', 25);
    this.legLGroup.add(this.legLMesh);
    this.torsoMesh.add(this.legLGroup);

    // 6. Right Leg (HP: 25)
    this.legRGroup = new THREE.Group();
    this.legRGroup.position.set(0.2, -0.4, 0);
    this.legRMesh = new THREE.Mesh(legGeo, this.matSkin);
    this.legRMesh.position.y = -0.35;
    this.tagLimb(this.legRMesh, 'leg_right', 25);
    this.legRGroup.add(this.legRMesh);
    this.torsoMesh.add(this.legRGroup);
  }

  tagLimb(mesh, type, hp) {
    mesh.isLimb = true;
    mesh.limbType = type;
    mesh.limbHp = hp;
    mesh.enemyRef = this;
  }

  severLimb(limbType, hitNormal) {
    if (this.isDead) return;

    let targetMesh = null;
    let parentGroup = null;

    if (limbType === 'head' && this.hasHead) {
      this.hasHead = false;
      targetMesh = this.headMesh;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.die();
    } else if (limbType === 'arm_left' && this.hasArmL) {
      this.hasArmL = false;
      targetMesh = this.armLGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 40;
    } else if (limbType === 'arm_right' && this.hasArmR) {
      this.hasArmR = false;
      targetMesh = this.armRGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 40;
    } else if (limbType === 'leg_left' && this.hasLegL) {
      this.hasLegL = false;
      targetMesh = this.legLGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 35;
      this.speed = 1.5;
    } else if (limbType === 'leg_right' && this.hasLegR) {
      this.hasLegR = false;
      targetMesh = this.legRGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 35;
      this.speed = 1.5;
    }

    if (targetMesh && parentGroup) {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      targetMesh.getWorldPosition(worldPos);
      targetMesh.getWorldQuaternion(worldQuat);

      parentGroup.remove(targetMesh);

      const gibGeo = targetMesh instanceof THREE.Group
        ? new THREE.BoxGeometry(0.25, 0.65, 0.25)
        : targetMesh.geometry.clone();
      this.gibList.push(new GibPart(this.scene, gibGeo, this.matSkin, worldPos, worldQuat, hitNormal || new THREE.Vector3(0, 1, 0)));

      this.bloodSys.spawnSplatter(worldPos, hitNormal || new THREE.Vector3(0, 1, 0), 28);

      if (!this.hasLegL && !this.hasLegR && !this.isCrawling) {
        this.isCrawling = true;
        this.torsoMesh.position.y = 0.42;
        this.torsoMesh.rotation.x = Math.PI / 2.3;
        this.speed = 1.0;
      }

      if (!this.hasArmL && !this.hasArmR) {
        this.bleedOutTimer = 3.5;
      }

      if (this.hp <= 0) {
        this.die();
      }
    }
  }

  takeTorsoDamage(amount, hitPos, hitNormal) {
    if (this.isDead) return;
    this.hp -= amount;
    this.bloodSys.spawnSplatter(hitPos, hitNormal, 12);
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.sound.playNecroGrowl(false);

    this.torsoMesh.position.y = 0.22;
    this.torsoMesh.rotation.x = Math.PI / 2;
    this.torsoMesh.rotation.z = (Math.random() - 0.5) * 0.8;
  }

  alertNearby(pos) {
    if (this.isDead || this.state === 'CHASE') return;
    const dist = this.root.position.distanceTo(pos);
    if (dist < 10.0) {
      this.state = 'CHASE';
      this.sound.playNecroGrowl(true);
    }
  }

  update(dt, player, colliders) {
    if (this.isDead) return;

    this.attackCooldown -= dt;

    if (!this.hasArmL && !this.hasArmR) {
      this.bleedOutTimer -= dt;
      if (this.bleedOutTimer <= 0) {
        this.die();
        return;
      }
    }

    const enemyEyePos = this.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const playerTorsoPos = player.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const toPlayer = new THREE.Vector3().subVectors(player.root.position, this.root.position);
    const dist = toPlayer.length();

    const hasLoS = checkLineOfSight(enemyEyePos, playerTorsoPos, colliders);

    if (this.state === 'PATROL') {
      let detected = false;

      if (player.flashlightOn && hasLoS && dist < 11.0) {
        const playerForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.root.rotation.y);
        const toEnemy = new THREE.Vector3().subVectors(this.root.position, player.root.position).normalize();
        const angle = playerForward.angleTo(toEnemy);
        if (angle < Math.PI / 3.0) {
          detected = true;
        }
      }

      if (hasLoS && dist < 5.0) {
        detected = true;
      }

      if (dist < 2.2) {
        detected = true;
      }

      if (detected) {
        this.state = 'CHASE';
        this.sound.playNecroGrowl(true);
      } else {
        this.patrolTimer -= dt;
        if (this.patrolTimer <= 0) {
          this.patrolTimer = Math.random() * 3 + 2;
          this.patrolDir += (Math.random() - 0.5) * Math.PI;
        }
        this.root.rotation.y = this.patrolDir;
      }
    }

    if (this.state === 'CHASE') {
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      this.root.rotation.y = angle;

      if (dist > this.attackRange) {
        const moveStep = this.speed * dt;
        const nextX = this.root.position.x + Math.sin(angle) * moveStep;
        const nextZ = this.root.position.z + Math.cos(angle) * moveStep;

        const testBox = new THREE.Box3(
          new THREE.Vector3(nextX - 0.45, 0.1, nextZ - 0.45),
          new THREE.Vector3(nextX + 0.45, 1.8, nextZ + 0.45)
        );
        let hit = false;
        for (let i = 0; i < colliders.length; i++) {
          if (testBox.intersectsBox(colliders[i])) { hit = true; break; }
        }
        if (!hit) {
          this.root.position.x = nextX;
          this.root.position.z = nextZ;
        }

        const t = Date.now() * 0.012;
        if (!this.isCrawling) {
          if (this.hasLegL) this.legLGroup.rotation.x = Math.sin(t) * 0.6;
          if (this.hasLegR) this.legRGroup.rotation.x = -Math.sin(t) * 0.6;
          if (this.hasArmL) this.armLGroup.rotation.x = -Math.sin(t) * 0.7;
          if (this.hasArmR) this.armRGroup.rotation.x = Math.sin(t) * 0.7;
          this.torsoMesh.rotation.z = Math.sin(t * 0.5) * 0.15;
        } else {
          if (this.hasArmL) this.armLGroup.rotation.x = Math.sin(t * 1.5) * 1.1;
          if (this.hasArmR) this.armRGroup.rotation.x = -Math.sin(t * 1.5) * 1.1;
        }
      } else {
        if (this.attackCooldown <= 0) {
          this.attack(player);
        }
      }
    }
  }

  attack(player) {
    if (!this.hasArmL && !this.hasArmR) {
      return;
    }

    this.attackCooldown = 1.6;
    this.sound.playNecroAttack();

    let dmg = 20;
    if (!this.hasArmL || !this.hasArmR) dmg = 12;

    player.takeDamage(dmg);

    if (this.hasArmR) {
      this.armRGroup.rotation.x = -Math.PI / 1.5;
      setTimeout(() => { if (!this.isDead && this.hasArmR) this.armRGroup.rotation.x = 0; }, 200);
    } else if (this.hasArmL) {
      this.armLGroup.rotation.x = -Math.PI / 1.5;
      setTimeout(() => { if (!this.isDead && this.hasArmL) this.armLGroup.rotation.x = 0; }, 200);
    }
  }
}
