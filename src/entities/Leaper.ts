import {
  Group,
  Mesh,
  BoxGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  Vector3,
  Quaternion,
  Box3,
  type Scene
} from 'three';
import { TextureFactory } from '../graphics/TextureFactory';
import { GibPart } from '../world/GibPart';
import { checkLineOfSight } from '../world/LineOfSight';
import type { SoundSystem } from '../core/SoundSystem';
import type { BloodParticleSystem } from '../graphics/BloodParticleSystem';
import type { Player } from './Player';
import type { LimbMesh, LimbType } from '../types';

import { PALETTE } from '../graphics/Palette';
/**
 * Leaper Necromorph Entity
 * Features:
 * - Legless quadrupedal horror built for sudden acrobatics
 * - Massive elongated spinal tail ending in a barbed chitinous scythe blade
 * - Crouches low to the ground, stalker behavior
 * - Long-distance acrobatic lunges towards Isaac Clarke (leaping 7 to 9 meters in mid-air!)
 * - High-speed slashing attacks when pinned or landing
 * - Dismemberment architecture matching Necromorph.js (head decapitation, bleed-out, proper GibPart creation)
 * - Strict wall collision handling during leaps to prevent sticking in walls
 * - Stasis Module temporal dilation (suspends mid-air leap and halves acrobatic velocities by 50%)
 */
export class Leaper {
  type = 'leaper';
  hp = 90;
  isDead = false;
  state: 'PATROL' | 'STALK' | 'WINDUP' | 'LUNGE' | 'ATTACK' = 'PATROL';
  patrolTimer = 0;
  patrolDir = Math.random() * Math.PI * 2;

  baseSpeed = 3.6;
  speed = this.baseSpeed;
  attackRange = 1.8;
  attackCooldown = 0;
  bleedOutTimer = 0;

  // Lunge mechanics
  isLeaping = false;
  lungeCooldown = 0;
  lungeWindupTimer = 0;
  lungeVel = new Vector3();

  // Stasis Status
  stasisTimer = 0;
  stasisFactor = 0.5;

  // Limb Tracking
  hasHead = true;
  hasTail = true;
  hasArmL = true;
  hasArmR = true;

  root = new Group();
  matSkin = new MeshStandardMaterial({
    map: TextureFactory.createNecroSkin(),
    roughness: 0.65,
    metalness: 0.2
  });

  matBlade = new MeshStandardMaterial({
    color: PALETTE.flesh.leather,
    roughness: 0.25,
    metalness: 0.85
  });

  torsoMesh!: Mesh;
  headMesh!: Mesh;
  armLGroup!: Group;
  armLMesh!: Mesh;
  armRGroup!: Group;
  armRMesh!: Mesh;
  tailGroup!: Group;
  tailBladeMesh!: Mesh;

  constructor(
    public scene: Scene,
    public sound: SoundSystem,
    spawnPos: Vector3,
    public gibList: GibPart[],
    public bloodSys: BloodParticleSystem
  ) {
    this.root.position.copy(spawnPos);
    this.scene.add(this.root);
    this.buildBody();
  }

  applyStasis(duration = 5.0, factor = 0.5): void {
    this.stasisTimer = Math.max(this.stasisTimer, duration);
    this.stasisFactor = factor;
  }

  tagLimb(mesh: Mesh, type: LimbType, hp: number): void {
    const limb = mesh as LimbMesh;
    limb.isLimb = true;
    limb.limbType = type;
    limb.limbHp = hp;
    limb.enemyRef = this;
  }

  buildBody(): void {
    // 1. Low Crouched Torso (Height 0.55m off the ground)
    const torsoGeo = new BoxGeometry(0.55, 0.45, 0.7);
    this.torsoMesh = new Mesh(torsoGeo, this.matSkin);
    this.torsoMesh.position.y = 0.55;
    this.torsoMesh.rotation.x = -0.15; // Low angled profile
    this.tagLimb(this.torsoMesh, 'torso', 999);
    this.root.add(this.torsoMesh);

    // 2. Feral Head (HP: 25)
    const headGeo = new BoxGeometry(0.3, 0.3, 0.35);
    this.headMesh = new Mesh(headGeo, this.matSkin);
    this.headMesh.position.set(0, 0.22, 0.45);
    this.tagLimb(this.headMesh, 'head', 25);
    this.torsoMesh.add(this.headMesh);

    // Jagged bone jaw
    const jawGeo = new BoxGeometry(0.24, 0.12, 0.24);
    const jawMesh = new Mesh(jawGeo, this.matBlade);
    jawMesh.position.set(0, -0.12, 0.08);
    this.headMesh.add(jawMesh);

    // 3. Left Crawling Arm (HP: 25)
    this.armLGroup = new Group();
    this.armLGroup.position.set(-0.38, 0.1, 0.25);
    const armGeo = new BoxGeometry(0.18, 0.6, 0.18);
    this.armLMesh = new Mesh(armGeo, this.matSkin);
    this.armLMesh.position.set(0, -0.25, 0);
    this.armLMesh.rotation.z = -0.3;
    this.armLGroup.add(this.armLMesh);
    this.tagLimb(this.armLMesh, 'arm_left', 25);
    this.torsoMesh.add(this.armLGroup);

    // 4. Right Crawling Arm (HP: 25)
    this.armRGroup = new Group();
    this.armRGroup.position.set(0.38, 0.1, 0.25);
    const armRMesh = new Mesh(armGeo, this.matSkin);
    armRMesh.position.set(0, -0.25, 0);
    armRMesh.rotation.z = 0.3;
    this.armRGroup.add(armRMesh);
    this.tagLimb(armRMesh, 'arm_right', 25);
    this.torsoMesh.add(this.armRGroup);

    // 5. Giant Barbed Spinal Tail (HP: 25 - Severing eliminates leaping!)
    this.tailGroup = new Group();
    this.tailGroup.position.set(0, 0.15, -0.35);

    const tailSeg1 = new Mesh(new BoxGeometry(0.2, 0.2, 0.5), this.matSkin);
    tailSeg1.position.set(0, 0.2, -0.25);
    tailSeg1.rotation.x = 0.5;
    this.tailGroup.add(tailSeg1);

    const tailSeg2 = new Mesh(new BoxGeometry(0.16, 0.16, 0.5), this.matSkin);
    tailSeg2.position.set(0, 0.5, -0.45);
    tailSeg2.rotation.x = 0.9;
    this.tailGroup.add(tailSeg2);

    const bladeGeo = new ConeGeometry(0.14, 0.85, 4);
    bladeGeo.rotateX(-Math.PI / 2.3);
    this.tailBladeMesh = new Mesh(bladeGeo, this.matBlade);
    this.tailBladeMesh.position.set(0, 0.85, -0.35);
    this.tailGroup.add(this.tailBladeMesh);

    this.tagLimb(tailSeg1, 'tail', 25);
    this.tagLimb(tailSeg2, 'tail', 25);
    this.tagLimb(this.tailBladeMesh, 'tail', 25);
    this.torsoMesh.add(this.tailGroup);
  }

  severLimb(limbType: LimbType, hitNormal?: Vector3): void {
    if (this.isDead) return;

    let targetMesh: any = null;
    let parentGroup: any = null;

    if (limbType === 'head' && this.hasHead) {
      this.hasHead = false;
      targetMesh = this.headMesh;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.die();
    } else if (limbType === 'tail' && this.hasTail) {
      this.hasTail = false;
      targetMesh = this.tailGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 40;
      this.isLeaping = false;
    } else if (limbType === 'arm_left' && this.hasArmL) {
      this.hasArmL = false;
      targetMesh = this.armLGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 35;
      this.speed *= 0.65;
    } else if (limbType === 'arm_right' && this.hasArmR) {
      this.hasArmR = false;
      targetMesh = this.armRGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 35;
      this.speed *= 0.65;
    }

    if (targetMesh && parentGroup) {
      const worldPos = new Vector3();
      const worldQuat = new Quaternion();
      targetMesh.getWorldPosition(worldPos);
      targetMesh.getWorldQuaternion(worldQuat);

      parentGroup.remove(targetMesh);

      const gibGeo = targetMesh instanceof Group
        ? (limbType === 'tail' ? new BoxGeometry(0.2, 0.8, 0.2) : new BoxGeometry(0.2, 0.5, 0.2))
        : targetMesh.geometry.clone();
      const gibMat = limbType === 'tail' ? this.matBlade : this.matSkin;
      this.gibList.push(new GibPart(this.scene, gibGeo, gibMat, worldPos, worldQuat, hitNormal || new Vector3(0, 1, 0)));

      this.bloodSys.spawnSplatter(worldPos, hitNormal || new Vector3(0, 1, 0), 28);

      // Bleed out if disarmed of arms or tail + arm
      if (!this.hasArmL && !this.hasArmR) {
        this.bleedOutTimer = 2.5;
      }
      if (!this.hasTail && (!this.hasArmL || !this.hasArmR)) {
        this.bleedOutTimer = 2.0;
      }

      if (this.hp <= 0) {
        this.die();
      }
    }
  }

  takeTorsoDamage(amount: number, hitPos: Vector3, hitNormal: Vector3): void {
    if (this.isDead) return;
    this.hp -= amount;
    this.bloodSys.spawnSplatter(hitPos, hitNormal, 12);
    if (this.hp <= 0) this.die();
  }

  die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.isLeaping = false;
    this.sound.playNecroGrowl(false);

    if (this.torsoMesh) {
      this.torsoMesh.position.y = 0.18;
      this.torsoMesh.rotation.x = Math.PI / 2;
      this.torsoMesh.rotation.z = (Math.random() - 0.5) * 0.8;
    }
  }

  alertNearby(pos: Vector3): void {
    if (this.isDead || this.state === 'STALK' || this.isLeaping) return;
    const dist = this.root.position.distanceTo(pos);
    if (dist < 14.0) {
      this.state = 'STALK';
      this.sound.playLeaperScreech();
    }
  }

  update(dt: number, player: Player, colliders: Box3[]): void {
    if (this.isDead) return;

    let effectiveDt = dt;
    if (this.stasisTimer > 0) {
      this.stasisTimer -= dt;
      effectiveDt = dt * this.stasisFactor;
      if (Math.random() < 0.25 && this.bloodSys) {
        const sparkPos = this.root.position.clone().add(new Vector3(
          (Math.random() - 0.5) * 0.7,
          Math.random() * 0.9,
          (Math.random() - 0.5) * 0.7
        ));
        this.bloodSys.spawnStasisSparks(sparkPos, 3);
      }
    }

    this.attackCooldown -= effectiveDt;
    this.lungeCooldown -= effectiveDt;

    if (this.bleedOutTimer > 0) {
      this.bleedOutTimer -= effectiveDt;
      if (this.bleedOutTimer <= 0) {
        this.die();
        return;
      }
    }

    // Tail scorpion idle twitch
    if (this.hasTail && this.tailGroup && !this.isLeaping) {
      this.tailGroup.rotation.x = Math.sin(Date.now() * 0.008) * 0.15;
      this.tailGroup.rotation.y = Math.cos(Date.now() * 0.006) * 0.12;
    }

    // Mid-air leap physics with robust wall collision detection
    if (this.isLeaping) {
      this.lungeVel.y -= 14.0 * effectiveDt; // Gravity slowed down by stasis
      const moveStep = this.lungeVel.clone().multiplyScalar(effectiveDt);
      const nextPos = this.root.position.clone().add(moveStep);

      // Check wall intersection during mid-air trajectory
      const leapBox = new Box3(
        new Vector3(nextPos.x - 0.45, Math.max(0.05, nextPos.y), nextPos.z - 0.45),
        new Vector3(nextPos.x + 0.45, nextPos.y + 0.8, nextPos.z + 0.45)
      );

      let wallHit = false;
      for (let i = 0; i < colliders.length; i++) {
        if (leapBox.intersectsBox(colliders[i])) {
          wallHit = true;
          break;
        }
      }

      if (!wallHit) {
        this.root.position.copy(nextPos);
      } else {
        // Hit wall mid-air: immediately abort leap, drop to floor, step back into room
        this.isLeaping = false;
        this.lungeVel.set(0, 0, 0);
        this.root.position.y = 0.05;
        if (this.torsoMesh) this.torsoMesh.rotation.x = -0.15;

        const stepBack = new Vector3(
          -Math.sin(this.root.rotation.y),
          0,
          -Math.cos(this.root.rotation.y)
        ).multiplyScalar(0.45);
        this.root.position.add(stepBack);

        this.state = 'STALK';
        this.lungeCooldown = 2.5;
        return;
      }

      // Leaping roll animation
      if (this.torsoMesh) this.torsoMesh.rotation.x += effectiveDt * 3.0;

      // Check landing or collision with player
      if (this.root.position.y <= 0.05) {
        this.root.position.y = 0.05;
        this.isLeaping = false;
        if (this.torsoMesh) this.torsoMesh.rotation.x = -0.15;

        // Ground shockwave hit check
        const d = this.root.position.distanceTo(player.root.position);
        if (d < 2.0 && !player.isDead) {
          player.takeDamage(32);
          this.sound.playNecroAttack();
        }
      }
      return;
    }

    const enemyEyePos = this.root.position.clone().add(new Vector3(0, 0.6, 0));
    const playerTorsoPos = player.root.position.clone().add(new Vector3(0, 1.2, 0));
    const toPlayer = new Vector3().subVectors(player.root.position, this.root.position);
    const dist = toPlayer.length();

    const hasLoS = checkLineOfSight(enemyEyePos, playerTorsoPos, colliders);

    if (this.state === 'PATROL') {
      if (dist < 12.0 && hasLoS) {
        this.state = 'STALK';
        this.sound.playLeaperScreech();
      } else {
        this.patrolTimer -= effectiveDt;
        if (this.patrolTimer <= 0) {
          this.patrolTimer = Math.random() * 3.0 + 2.0;
          this.patrolDir = Math.random() * Math.PI * 2;
        }

        const moveVec = new Vector3(Math.sin(this.patrolDir), 0, Math.cos(this.patrolDir)).multiplyScalar(1.2 * effectiveDt);
        const nextPos = this.root.position.clone().add(moveVec);

        const testBox = new Box3(
          new Vector3(nextPos.x - 0.45, 0.05, nextPos.z - 0.45),
          new Vector3(nextPos.x + 0.45, 1.2, nextPos.z + 0.45)
        );

        let blocked = false;
        for (let i = 0; i < colliders.length; i++) {
          if (testBox.intersectsBox(colliders[i])) {
            blocked = true;
            break;
          }
        }

        if (!blocked) {
          this.root.position.copy(nextPos);
        } else {
          this.patrolDir += Math.PI * 0.5 + Math.random() * Math.PI;
          this.patrolTimer = Math.random() * 2.0 + 1.0;
        }
        this.root.rotation.y = this.patrolDir;
      }
    } else if (this.state === 'STALK') {
      toPlayer.y = 0;
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      this.root.rotation.y = angle;

      // Decision: Lunge or Crawl
      if (this.hasTail && dist >= 3.5 && dist <= 9.5 && this.lungeCooldown <= 0 && hasLoS) {
        this.state = 'WINDUP';
        this.lungeWindupTimer = 0.35; // 0.35s windup crouch
        this.sound.playLeaperScreech();
        return;
      }

      // Close melee attack
      if (dist <= this.attackRange && this.attackCooldown <= 0) {
        this.attack(player);
        return;
      }

      // Crawl towards player
      toPlayer.normalize();
      const moveStep = toPlayer.clone().multiplyScalar(this.speed * effectiveDt);
      const nextPos = this.root.position.clone().add(moveStep);

      const testBox = new Box3(
        new Vector3(nextPos.x - 0.5, 0.05, nextPos.z - 0.5),
        new Vector3(nextPos.x + 0.5, 1.2, nextPos.z + 0.5)
      );

      let blocked = false;
      for (let i = 0; i < colliders.length; i++) {
        if (testBox.intersectsBox(colliders[i])) {
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        this.root.position.copy(nextPos);
      }

      // Scuttling arm gait
      const scuttleSpeed = this.stasisTimer > 0 ? 0.009 : 0.018;
      const scuttle = Math.sin(Date.now() * scuttleSpeed) * 0.5;
      if (this.hasArmL && this.armLGroup) this.armLGroup.rotation.x = scuttle;
      if (this.hasArmR && this.armRGroup) this.armRGroup.rotation.x = -scuttle;

    } else if (this.state === 'WINDUP') {
      toPlayer.y = 0;
      this.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

      if (this.torsoMesh) this.torsoMesh.position.y = 0.35;
      this.lungeWindupTimer -= effectiveDt;

      if (this.lungeWindupTimer <= 0) {
        // Launch into air!
        this.state = 'STALK';
        this.isLeaping = true;
        this.lungeCooldown = 4.0;
        if (this.torsoMesh) this.torsoMesh.position.y = 0.55;

        toPlayer.normalize();
        this.lungeVel.set(
          toPlayer.x * 12.0,
          5.5,
          toPlayer.z * 12.0
        );
      }
    }
  }

  attack(player: Player): void {
    if (!this.hasArmL && !this.hasArmR && !this.hasTail) {
      return;
    }

    this.attackCooldown = 0.9;
    this.sound.playNecroAttack();

    let dmg = 15;
    if (this.hasTail) dmg = 28;
    else if (this.hasArmL && this.hasArmR) dmg = 20;

    player.takeDamage(dmg);

    if (this.tailGroup) {
      this.tailGroup.rotation.x = -Math.PI / 2.0;
      setTimeout(() => { if (!this.isDead && this.tailGroup) this.tailGroup.rotation.x = 0; }, 200);
    }
  }
}
