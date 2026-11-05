import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
  Quaternion,
  Box3,
  type BufferGeometry,
  type Scene
} from 'three';
import { skinMaterial, boneMaterial } from '../graphics/EnemyMaterials';
import * as anatomy from './anatomy';
import { GibPart } from '../world/GibPart';
import { checkLineOfSight } from '../world/LineOfSight';
import type { SoundSystem } from '../core/SoundSystem';
import type { BloodParticleSystem } from '../graphics/BloodParticleSystem';
import type { Player } from './Player';
import type { LimbMesh, LimbType } from '../types';

import { PALETTE } from '../graphics/Palette';
/**
 * Exploder Necromorph Entity
 * Features:
 * - Mutated humanoid with a giant, pulsating, glowing volatile rectangular amber sac on its left arm
 * - High-risk suicidal behavior: runs toward Isaac to trigger a lethal explosion
 * - Dismemberment architecture matching Necromorph.js (head decapitation, leg crawling, proper GibPart creation)
 * - Decapitation headshot kills Exploder immediately, leaving the volatile sac intact on the corpse or floor
 * - Shooting the sac (living or dead) detonates a massive AoE blast
 * - Stasis Module temporal dilation (slows running, detonation fuse, and animation by 50%)
 */
export class Exploder {
  type = 'exploder';
  hp = 100;
  isDead = false;
  exploded = false;
  killCounted = false;
  state: 'PATROL' | 'CHASE' = 'PATROL';
  patrolTimer = 0;
  patrolDir = Math.random() * Math.PI * 2;

  baseSpeed = 3.2; // Runs faster than regular Slasher
  speed = this.baseSpeed;
  explodeRange = 1.8;
  squealTimer = 0;
  fuseTimer = 0;
  isDetonating = false;

  // Stasis Status
  stasisTimer = 0;
  stasisFactor = 0.5;

  // Limb Tracking
  hasHead = true;
  hasSac = true;
  hasArmR = true;
  hasLegL = true;
  hasLegR = true;
  isCrawling = false;

  root = new Group();
  matSkin = skinMaterial('exploder');
  matBone = boneMaterial(PALETTE.flesh.bone);
  idlePhase = Math.random() * 10;

  // Volatile glowing orange/yellow organic explosive material
  matSac = new MeshStandardMaterial({
    color: PALETTE.amber.mid,
    emissive: PALETTE.fire.blast,
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.1
  });

  // Fleshy, only faintly glowing pustules around the volatile core
  matSacFlesh = new MeshStandardMaterial({
    color: PALETTE.flesh.skin,
    emissive: PALETTE.fire.blast,
    emissiveIntensity: 0.3,
    roughness: 0.35,
    metalness: 0.05
  });

  torsoMesh!: Mesh;
  headMesh!: Mesh;
  armLGroup!: Group;
  sacGroup!: Group;
  sacMesh!: Mesh;
  sacLight!: PointLight;
  armRGroup!: Group;
  armRMesh!: Mesh;
  legLGroup!: Group;
  legLMesh!: Mesh;
  legRGroup!: Group;
  legRMesh!: Mesh;

  onExplosionCallback?: (blastCenter: Vector3, radius: number, damage: number, instigatedByPlayer: boolean) => void;

  constructor(
    public scene: Scene,
    public sound: SoundSystem,
    spawnPos: Vector3,
    public gibList: GibPart[],
    public bloodSys: BloodParticleSystem
  ) {
    this.root.position.copy(spawnPos);
    this.root.scale.setScalar(0.94 + Math.random() * 0.14);
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
    // Tall, gaunt frame (~2.2 m): long legs, narrow hunched torso, arms that reach the floor.
    // 1. Torso
    this.torsoMesh = new Mesh(anatomy.torso(0.42, 0.95, 0.3, 5), this.matSkin);
    this.torsoMesh.position.y = 1.38;
    this.torsoMesh.rotation.x = 0.35; // Hunched forward
    this.tagLimb(this.torsoMesh, 'torso', 999);
    this.root.add(this.torsoMesh);

    // 2. Small, twisted head (HP: 25)
    this.headMesh = new Mesh(anatomy.head(0.24, 0.3, 0.28, 6), this.matSkin);
    this.headMesh.position.set(0, 0.62, 0.2);
    this.headMesh.rotation.z = 0.2;
    this.tagLimb(this.headMesh, 'head', 25);
    this.torsoMesh.add(this.headMesh);

    // 3. Volatile sac arm (left): long thin arm dragging a cluster of sacs (HP: 18, one shot detonates it)
    this.armLGroup = new Group();
    this.armLGroup.position.set(-0.3, 0.38, 0.05);

    const upperArm = new Mesh(anatomy.limb(1.3, 0.085, 0.05, 0.2, 7), this.matSkin);
    upperArm.position.y = -0.65;
    this.armLGroup.add(upperArm);

    this.sacGroup = new Group();
    this.sacGroup.position.set(-0.08, -1.3, 0.18);

    // Glowing core plus a ring of bumpy pustules (golden-angle spiral so they spread evenly)
    this.sacMesh = new Mesh(anatomy.lump(0.24, 1).scale(1, 1.25, 1), this.matSac);
    this.sacGroup.add(this.sacMesh);
    const pustules: Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const y = 1 - (i / 8) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const ang = i * 2.399963;
      const rad = 0.11 + (i % 3) * 0.03;
      const pustule = new Mesh(anatomy.lump(rad, 2 + i), i % 2 === 0 ? this.matSac : this.matSacFlesh);
      pustule.position.set(Math.cos(ang) * ring * 0.26, y * 0.32, Math.sin(ang) * ring * 0.26);
      this.sacGroup.add(pustule);
      pustules.push(pustule);
    }
    this.armLGroup.add(this.sacGroup);

    // Glowing sac core point light
    this.sacLight = new PointLight(PALETTE.fire.flame, 1.8, 4.0);
    this.sacLight.position.copy(this.sacGroup.position);
    this.armLGroup.add(this.sacLight);

    this.tagLimb(this.sacMesh, 'explosive_sac', 18);
    pustules.forEach(p => this.tagLimb(p, 'explosive_sac', 18));
    this.tagLimb(upperArm, 'explosive_sac', 18);
    this.torsoMesh.add(this.armLGroup);

    // 4. Right arm: very long, clawed hand near the floor (HP: 25)
    this.armRGroup = new Group();
    this.armRGroup.position.set(0.3, 0.38, 0);
    this.armRMesh = new Mesh(anatomy.limb(1.6, 0.08, 0.045, 0.25, 8), this.matSkin);
    this.armRMesh.position.y = -0.8;
    this.tagLimb(this.armRMesh, 'arm_right', 25);
    const clawHand = new Mesh(anatomy.claws(3, 0.3, 0.025, 0.6), this.matBone);
    clawHand.position.y = -0.8;
    this.armRMesh.add(clawHand);
    this.armRGroup.add(this.armRMesh);
    this.torsoMesh.add(this.armRGroup);

    // 5. Left leg (HP: 25)
    this.legLGroup = new Group();
    this.legLGroup.position.set(-0.15, -0.44, 0);
    const legGeo = anatomy.limb(1.0, 0.09, 0.055, 0.3, 9);
    this.legLMesh = new Mesh(legGeo, this.matSkin);
    this.legLMesh.position.y = -0.5;
    this.tagLimb(this.legLMesh, 'leg_left', 25);
    this.legLGroup.add(this.legLMesh);
    this.torsoMesh.add(this.legLGroup);

    // 6. Right leg (HP: 25)
    this.legRGroup = new Group();
    this.legRGroup.position.set(0.15, -0.44, 0);
    this.legRMesh = new Mesh(legGeo, this.matSkin);
    this.legRMesh.position.y = -0.5;
    this.tagLimb(this.legRMesh, 'leg_right', 25);
    this.legRGroup.add(this.legRMesh);
    this.torsoMesh.add(this.legRGroup);
  }

  severLimb(limbType: LimbType, hitNormal?: Vector3): void {
    if (this.isDead && limbType !== 'explosive_sac') return;

    // Shooting the explosive sac directly triggers a violent detonation!
    if (limbType === 'explosive_sac') {
      this.explode(true);
      return;
    }

    let targetMesh: any = null;
    let parentGroup: any = null;

    if (limbType === 'head' && this.hasHead) {
      this.hasHead = false;
      targetMesh = this.headMesh;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.die(); // Instant decapitation kill, sac stays intact!
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
      this.speed = 1.3;
    } else if (limbType === 'leg_right' && this.hasLegR) {
      this.hasLegR = false;
      targetMesh = this.legRGroup;
      parentGroup = this.torsoMesh;
      this.sound.playDismember();
      this.hp -= 35;
      this.speed = 1.3;
    }

    if (targetMesh && parentGroup) {
      const worldPos = new Vector3();
      const worldQuat = new Quaternion();
      targetMesh.getWorldPosition(worldPos);
      targetMesh.getWorldQuaternion(worldQuat);

      parentGroup.remove(targetMesh);

      const gibGeo = targetMesh instanceof Group
        ? anatomy.limb(1.0, 0.08, 0.05)
        : targetMesh.geometry.clone();
      this.gibList.push(new GibPart(this.scene, gibGeo, this.matSkin, worldPos, worldQuat, hitNormal || new Vector3(0, 1, 0)));

      this.bloodSys.spawnSplatter(worldPos, hitNormal || new Vector3(0, 1, 0), 28);

      // Exactly matching Necromorph crawling architecture
      if (!this.hasLegL && !this.hasLegR && !this.isCrawling) {
        this.isCrawling = true;
        this.torsoMesh.position.y = 0.42;
        this.torsoMesh.rotation.x = Math.PI / 2.3;
        this.speed = 1.0;
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

  explode(instigatedByPlayer = false): void {
    if (this.exploded) return;
    this.exploded = true;
    this.isDead = true;
    this.hasSac = false;
    this.hp = 0;

    const blastCenter = new Vector3();
    if (this.sacGroup) {
      this.sacGroup.getWorldPosition(blastCenter);
    } else {
      blastCenter.copy(this.root.position).add(new Vector3(0, 0.5, 0));
    }

    this.sound.playExplosion();
    this.bloodSys.spawnExplosionBlast(blastCenter, 80);
    this.bloodSys.spawnSplatter(blastCenter, new Vector3(0, 1, 0), 45);

    // Turn all remaining body parts into physical bouncing GibParts
    const spawnPartGib = (mesh: Mesh | Group, baseGeo?: BufferGeometry): void => {
      const worldPos = new Vector3();
      const worldQuat = new Quaternion();
      mesh.getWorldPosition(worldPos);
      mesh.getWorldQuaternion(worldQuat);

      const awayDir = new Vector3().subVectors(worldPos, blastCenter);
      if (awayDir.lengthSq() < 0.01) {
        awayDir.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
      }
      awayDir.normalize();

      // Explosive velocity: outward and upward arc
      const impulse = awayDir.multiplyScalar(3.2 + Math.random() * 3.0);
      impulse.y = Math.max(impulse.y, 1.8) + Math.random() * 2.2;

      let geo: any;
      if (baseGeo) {
        geo = baseGeo;
      } else if (mesh instanceof Mesh && mesh.geometry) {
        geo = mesh.geometry.clone();
      } else {
        geo = anatomy.limb(0.55, 0.1, 0.07);
      }

      this.gibList.push(new GibPart(this.scene, geo, this.matSkin, worldPos, worldQuat, impulse));
    };

    // 1. Head gib
    if (this.hasHead && this.headMesh) {
      spawnPartGib(this.headMesh, anatomy.head(0.24, 0.3, 0.28));
    }

    // 2. Right Arm gib
    if (this.hasArmR && this.armRGroup) {
      spawnPartGib(this.armRGroup, anatomy.limb(1.6, 0.08, 0.045));
    }

    // 3. Left Leg gib
    if (this.hasLegL && this.legLGroup) {
      spawnPartGib(this.legLGroup, anatomy.limb(1.0, 0.09, 0.055));
    }

    // 4. Right Leg gib
    if (this.hasLegR && this.legRGroup) {
      spawnPartGib(this.legRGroup, anatomy.limb(1.0, 0.09, 0.055));
    }

    // 5. Shattered Torso meaty gibs (flesh & rib chunks)
    const torsoPos = new Vector3();
    const torsoQuat = new Quaternion();
    this.torsoMesh.getWorldPosition(torsoPos);
    this.torsoMesh.getWorldQuaternion(torsoQuat);

    const chunkGeos = [
      anatomy.body(0.34, 0.38, 0.28, 1),
      anatomy.body(0.28, 0.30, 0.24, 2),
      anatomy.body(0.22, 0.24, 0.20, 3)
    ];

    chunkGeos.forEach(cGeo => {
      const cPos = torsoPos.clone().add(new Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      ));
      const cDir = new Vector3().subVectors(cPos, blastCenter);
      if (cDir.lengthSq() < 0.01) {
        cDir.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
      }
      cDir.normalize().multiplyScalar(2.8 + Math.random() * 2.8);
      cDir.y = Math.max(cDir.y, 1.4) + Math.random() * 1.8;

      this.gibList.push(new GibPart(this.scene, cGeo, this.matSkin, cPos, torsoQuat, cDir));
    });

    // Remove the body and lights completely from scene so no frozen mannequin remains
    if (this.sacLight && this.sacLight.parent) {
      this.sacLight.parent.remove(this.sacLight);
    }
    if (this.root && this.root.parent) {
      this.root.parent.remove(this.root);
    } else {
      this.scene.remove(this.root);
    }

    if (this.onExplosionCallback) {
      this.onExplosionCallback(blastCenter, 5.5, 65, instigatedByPlayer);
    }
  }

  die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.sound.playNecroGrowl(false);

    this.torsoMesh.position.y = 0.22;
    this.torsoMesh.rotation.x = Math.PI / 2;
    this.torsoMesh.rotation.z = (Math.random() - 0.5) * 0.8;

    // Volatile explosive sac stays active and shootable on corpse or ground!
    if (this.hasSac && this.sacLight) {
      this.sacLight.intensity = 0.9;
      this.matSac.emissiveIntensity = 0.6;
    }
  }

  alertNearby(pos: Vector3): void {
    if (this.isDead || this.state === 'CHASE') return;
    const dist = this.root.position.distanceTo(pos);
    if (dist < 12.0) {
      this.state = 'CHASE';
      this.sound.playExploderSqueal();
    }
  }

  update(dt: number, player: Player, colliders: Box3[]): void {
    if (this.isDead) {
      // If dead but sac is intact, maintain a low volatile breathing pulse
      if (this.hasSac && this.sacLight && !this.exploded) {
        const slowPulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
        this.sacLight.intensity = slowPulse;
        this.matSac.emissiveIntensity = slowPulse * 0.7;
      }
      return;
    }

    let effectiveDt = dt;
    if (this.stasisTimer > 0) {
      this.stasisTimer -= dt;
      effectiveDt = dt * this.stasisFactor;
      if (Math.random() < 0.25 && this.bloodSys) {
        const sparkPos = this.root.position.clone().add(new Vector3(
          (Math.random() - 0.5) * 0.7,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 0.7
        ));
        this.bloodSys.spawnStasisSparks(sparkPos, 3);
      }
    }

    anatomy.idleBreath(this.torsoMesh, this.hasHead ? this.headMesh : null, performance.now() / 1000, this.idlePhase);

    // Pulsate glowing amber sac
    if (this.hasSac && this.sacLight) {
      const pulse = 0.8 + Math.sin(Date.now() * 0.012) * 0.4;
      this.sacLight.intensity = pulse * (this.isDetonating ? 3.0 : 1.8);
      this.matSac.emissiveIntensity = pulse * (this.isDetonating ? 1.8 : 0.85);
    }

    const enemyEyePos = this.root.position.clone().add(new Vector3(0, 1.2, 0));
    const playerTorsoPos = player.root.position.clone().add(new Vector3(0, 1.2, 0));
    const toPlayer = new Vector3().subVectors(player.root.position, this.root.position);
    const dist = toPlayer.length();

    const hasLoS = checkLineOfSight(enemyEyePos, playerTorsoPos, colliders);

    if (this.state === 'PATROL') {
      if (dist < 9.0 && hasLoS) {
        this.state = 'CHASE';
        this.sound.playExploderSqueal();
      } else {
        this.patrolTimer -= effectiveDt;
        if (this.patrolTimer <= 0) {
          this.patrolTimer = Math.random() * 3.0 + 2.0;
          this.patrolDir = Math.random() * Math.PI * 2;
        }

        const moveVec = new Vector3(Math.sin(this.patrolDir), 0, Math.cos(this.patrolDir)).multiplyScalar((this.isCrawling ? 0.45 : 0.9) * effectiveDt);
        const nextPos = this.root.position.clone().add(moveVec);

        const testBox = new Box3(
          new Vector3(nextPos.x - 0.45, 0.1, nextPos.z - 0.45),
          new Vector3(nextPos.x + 0.45, this.isCrawling ? 0.7 : 1.8, nextPos.z + 0.45)
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
    } else if (this.state === 'CHASE') {
      toPlayer.y = 0;
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      this.root.rotation.y = angle;

      // Occasional suicidal squeal
      this.squealTimer -= effectiveDt;
      if (this.squealTimer <= 0) {
        this.squealTimer = Math.random() * 2.5 + 2.0;
        this.sound.playExploderSqueal();
      }

      // Close enough to detonate
      if (dist <= this.explodeRange && !this.isDetonating) {
        this.isDetonating = true;
        this.fuseTimer = 0.25; // 0.25s fuse
      }

      if (this.isDetonating) {
        this.fuseTimer -= effectiveDt;
        if (this.armLGroup) this.armLGroup.rotation.x = -Math.PI / 1.5;
        if (this.fuseTimer <= 0) {
          this.explode(false);
          return;
        }
      } else {
        // Move towards player
        toPlayer.normalize();
        const moveStep = toPlayer.clone().multiplyScalar(this.speed * effectiveDt);
        const nextPos = this.root.position.clone().add(moveStep);

        const testBox = new Box3(
          new Vector3(nextPos.x - 0.45, 0.1, nextPos.z - 0.45),
          new Vector3(nextPos.x + 0.45, this.isCrawling ? 0.7 : 1.8, nextPos.z + 0.45)
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

        const animSpeed = this.stasisTimer > 0 ? 0.006 : 0.012;
        const t = Date.now() * animSpeed;
        if (!this.isCrawling) {
          if (this.hasLegL && this.legLGroup) this.legLGroup.rotation.x = Math.sin(t) * 0.6;
          if (this.hasLegR && this.legRGroup) this.legRGroup.rotation.x = -Math.sin(t) * 0.6;
          if (this.hasArmR && this.armRGroup) this.armRGroup.rotation.x = -Math.sin(t) * 0.7;
          this.torsoMesh.rotation.z = Math.sin(t * 0.5) * 0.15;
        } else {
          // Exactly matching Necromorph crawler animation
          if (this.hasArmR && this.armRGroup) this.armRGroup.rotation.x = Math.sin(t * 1.5) * 1.1;
          if (this.hasSac && this.armLGroup) this.armLGroup.rotation.x = -Math.sin(t * 1.5) * 0.8;
          this.torsoMesh.rotation.z = Math.sin(t * 0.5) * 0.15;
        }
      }
    }
  }
}
