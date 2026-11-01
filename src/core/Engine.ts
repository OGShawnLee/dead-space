import {
  Scene,
  FogExp2,
  PerspectiveCamera,
  WebGLRenderer,
  PCFSoftShadowMap,
  AmbientLight,
  Clock,
  Vector3,
  Vector2,
  Raycaster,
  Group,
  SphereGeometry,
  MeshBasicMaterial,
  Mesh,
  PointLight,
  BufferGeometry,
  LineBasicMaterial,
  Line,
  Box3
} from 'three';
import { SoundSystem } from './SoundSystem';
import { InputManager } from './InputManager';
import { ShipLevel } from '../world/ShipLevel';
import { BloodParticleSystem } from '../graphics/BloodParticleSystem';
import { Player } from '../entities/Player';
import { Necromorph } from '../entities/Necromorph';
import { Exploder } from '../entities/Exploder';
import { Leaper } from '../entities/Leaper';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { HoloMenu } from '../ui/HoloMenu';
import {
  buildMainMenu,
  buildPauseMenu,
  buildDeathMenu,
  buildVictoryMenu,
  DEFAULT_SETTINGS,
  type MenuContext
} from '../ui/GameMenus';
import type { GibPart } from '../world/GibPart';
import type { CameraSettings, LimbMesh } from '../types';

export type Enemy = (Necromorph | Exploder | Leaper) & {
  type?: string;
  hasSac?: boolean;
  exploded?: boolean;
  killCounted?: boolean;
  onExplosionCallback?: (blastCenter: Vector3, radius: number, damage: number, instigatedByPlayer: boolean) => void;
  sacGroup?: Group;
};

export interface StasisProjectile {
  group: Group;
  dir: Vector3;
  speed: number;
  life: number;
}

/**
 * Dead Space Game Engine Core
 * Coordinates scene, rendering, update loop, combat raycasts, enemy variants, and state transitions.
 */
export class DeadSpaceGame {
  container = document.getElementById('game-container') as HTMLElement;
  enemies: Enemy[] = [];
  gibs: GibPart[] = [];
  stasisProjectiles: StasisProjectile[] = [];
  statsKills = 0;
  statsLimbs = 0;
  // Game starts frozen behind the main menu until "Nueva partida" is selected
  isPaused = true;
  missionStarted = false;
  endScreenShown = false;
  gameWon = false;

  scene!: Scene;
  camera!: PerspectiveCamera;
  renderer!: WebGLRenderer;
  ambientLight!: AmbientLight;

  sound!: SoundSystem;
  level!: ShipLevel;
  bloodSys!: BloodParticleSystem;
  player!: Player;
  cameraController!: ThirdPersonCamera;
  settings!: CameraSettings;
  input!: InputManager;
  menu!: HoloMenu;
  menuCtx!: MenuContext;
  clock = new Clock();
  promptTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    this.initThree();
    this.sound = new SoundSystem();
    this.level = new ShipLevel(this.scene);
    this.bloodSys = new BloodParticleSystem(this.scene);

    this.player = new Player(this.scene, this.sound, this.level.playerStart);
    this.cameraController = new ThirdPersonCamera(this.camera, this.player, this.scene, this.container);

    this.settings = this.loadSettings();
    this.cameraController.setSettings(this.settings);
    this.sound.setMasterVolume(this.settings.volume ?? DEFAULT_SETTINGS.volume!);

    this.input = new InputManager({
      onToggleFlashlight: () => this.handleToggleFlashlight(),
      onReload: () => this.handleReload(),
      onHeal: () => this.handleHeal(),
      onTogglePause: () => this.handleEscape(),
      onAimChange: (aiming) => this.handleAimChange(aiming),
      onShoot: () => this.shootPlasmaCutter(),
      onStasis: () => this.handleStasisFire()
    });

    this.spawnEnemies();
    this.setupMenus();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  loadSettings(): CameraSettings {
    try {
      const saved = localStorage.getItem('deadspace_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not load settings from localStorage', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(partial: Partial<CameraSettings>): void {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem('deadspace_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage', e);
    }
    this.cameraController.setSettings(this.settings);
    if (typeof this.settings.volume === 'number') this.sound.setMasterVolume(this.settings.volume);
  }

  initThree(): void {
    this.scene = new Scene();
    this.scene.fog = new FogExp2(0x050608, 0.08);

    this.camera = new PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 100);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.ambientLight = new AmbientLight(0x080b12, 0.18);
    this.scene.add(this.ambientLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  spawnEnemies(): void {
    this.level.spawnPoints.forEach((pos, idx) => {
      let enemy: Enemy;
      // Distribute variants: 50% Slasher, 25% Exploder, 25% Leaper
      const variantRoll = (idx % 4);
      if (variantRoll === 1) {
        const exp = new Exploder(this.scene, this.sound, pos, this.gibs, this.bloodSys);
        exp.onExplosionCallback = (blastPos, radius, maxDmg, byPlayer) => {
          this.handleExplosionAoE(blastPos, radius, maxDmg, byPlayer);
        };
        enemy = exp;
      } else if (variantRoll === 3) {
        enemy = new Leaper(this.scene, this.sound, pos, this.gibs, this.bloodSys);
      } else {
        enemy = new Necromorph(this.scene, this.sound, pos, this.gibs, this.bloodSys);
      }
      this.enemies.push(enemy);
    });
    this.updateThreatCounter();
  }

  handleExplosionAoE(blastPos: Vector3, radius: number, maxDmg: number, _byPlayer: boolean): void {
    // Damage player if within blast radius
    const distToPlayer = blastPos.distanceTo(this.player.root.position);
    if (distToPlayer <= radius && !this.player.isDead) {
      const dmgFactor = Math.max(0.2, 1.0 - (distToPlayer / radius));
      const playerDmg = Math.round(maxDmg * dmgFactor);
      this.player.takeDamage(playerDmg);
      this.showPrompt('¡ONDA EXPANSIVA DETONADA!');
    }

    // Damage & dismember other enemies caught in the explosion (including volatile unexploded sacs on dead exploders!)
    this.enemies.forEach(other => {
      const isAliveOrVolatile = !other.isDead || (other.type === 'exploder' && other.hasSac && !other.exploded);
      if (isAliveOrVolatile && other.root.position.distanceTo(blastPos) <= radius) {
        const d = other.root.position.distanceTo(blastPos);
        const dmgFactor = Math.max(0.3, 1.0 - (d / radius));
        const dmg = Math.round(110 * dmgFactor);

        const awayDir = new Vector3().subVectors(other.root.position, blastPos).normalize();
        if (other.type === 'exploder' && !other.exploded) {
          // Chain reaction detonation!
          (other as Exploder).explode(true);
        } else if (other.type === 'leaper') {
          other.takeTorsoDamage(dmg, other.root.position, awayDir);
          if (other.severLimb) {
            other.severLimb('tail', awayDir);
            other.severLimb('arm_left', awayDir);
          }
          if (dmg >= 45 || other.hp <= 0) {
            other.die();
          }
        } else {
          other.takeTorsoDamage(dmg, other.root.position, awayDir);
          // High explosive blast severs limbs
          if (other.severLimb) {
            other.severLimb('arm_left', awayDir);
            other.severLimb('leg_left', awayDir);
          }
        }

        if (other.isDead && !other.killCounted) {
          other.killCounted = true;
          this.statsKills++;
          this.updateThreatCounter();
        }
      }
    });

    this.updateThreatCounter();
  }

  handleToggleFlashlight(): void {
    if (this.isPaused || this.player.isDead || this.gameWon) return;
    const on = this.player.toggleFlashlight();
    const flBadge = document.getElementById('flashlight-status');
    if (flBadge) {
      flBadge.textContent = on ? 'ON' : 'OFF';
      flBadge.className = on ? 'supply-value status-active' : 'supply-value';
    }
  }

  handleReload(): void {
    if (this.isPaused || this.player.isDead || this.gameWon) return;
    if (this.player.reload()) {
      this.showPrompt('Recargando Cortador de Plasma...');
    } else if (this.player.reserveAmmo <= 0) {
      this.showPrompt('¡Sin células de plasma de reserva!');
    }
  }

  handleHeal(): void {
    if (this.isPaused || this.player.isDead || this.gameWon) return;
    if (this.player.heal()) {
      const medkitEl = document.getElementById('medkit-count');
      if (medkitEl) medkitEl.textContent = String(this.player.medkits);
      this.showPrompt('+50 Salud inyectada');
    } else if (this.player.medkits <= 0) {
      this.showPrompt('¡No tienes botiquines!');
    }
  }

  handleAimChange(aiming: boolean): void {
    if (aiming && (this.isPaused || this.player.isDead || this.gameWon)) return;
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      if (aiming) crosshair.classList.remove('crosshair-hidden');
      else crosshair.classList.add('crosshair-hidden');
    }
  }

  handleStasisFire(): void {
    if (this.player.isDead || this.gameWon || !this.cameraController.isLocked) return;

    if (!this.player.isAiming) {
      this.showPrompt('¡Apunta para disparar el Módulo de Estabilización!');
      return;
    }

    if (this.player.stasisCharges <= 0) {
      this.player.fireStasis(); // Triggers playStasisEmpty()
      this.showPrompt('¡Módulo de Estabilización sin energía!');
      return;
    }

    if (this.player.fireStasis()) {
      const armWorldPos = new Vector3();
      this.player.armL.getWorldPosition(armWorldPos);
      armWorldPos.add(new Vector3(0, 0.1, 0.25));

      const raycaster = new Raycaster();
      raycaster.setFromCamera(new Vector2(0, 0), this.camera);
      const targetDir = raycaster.ray.direction.clone().normalize();

      // Glowing Cyan Stasis Orb
      const orbGroup = new Group();
      orbGroup.position.copy(armWorldPos);

      const coreMesh = new Mesh(
        new SphereGeometry(0.18, 12, 12),
        new MeshBasicMaterial({ color: 0x00f0ff })
      );
      orbGroup.add(coreMesh);

      const haloMesh = new Mesh(
        new SphereGeometry(0.32, 8, 8),
        new MeshBasicMaterial({
          color: 0x38b6ff,
          wireframe: true,
          transparent: true,
          opacity: 0.6
        })
      );
      orbGroup.add(haloMesh);

      const orbLight = new PointLight(0x00f0ff, 2.5, 5.0);
      orbGroup.add(orbLight);

      this.scene.add(orbGroup);

      this.stasisProjectiles.push({
        group: orbGroup,
        dir: targetDir,
        speed: 32.0,
        life: 1.6
      });
    }
  }

  shootPlasmaCutter(): void {
    if (!this.cameraController.isLocked || this.isPaused || this.player.isDead || this.gameWon) return;

    if (this.player.ammo <= 0) {
      this.sound.playPlasmaEmpty();
      this.showPrompt('¡Cortador sin energía! Presiona [R] para recargar');
      return;
    }

    this.player.ammo--;
    this.player.updateHoloAmmo();
    this.sound.playPlasmaShot();

    // Alert nearby enemies with sound
    this.enemies.forEach(e => e.alertNearby(this.player.root.position));

    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), this.camera);

    const shootableLimbMeshes: LimbMesh[] = [];
    this.enemies.forEach(enemy => {
      if (!enemy.isDead) {
        enemy.root.traverse(child => {
          if ((child as LimbMesh).isLimb) shootableLimbMeshes.push(child as LimbMesh);
        });
      } else if (enemy.type === 'exploder' && enemy.hasSac && !enemy.exploded) {
        // Volatile sac on a dead exploder corpse remains shootable and explosive!
        if (enemy.sacGroup) {
          enemy.sacGroup.traverse(child => {
            if ((child as LimbMesh).isLimb) shootableLimbMeshes.push(child as LimbMesh);
          });
        }
      }
    });

    const hits = raycaster.intersectObjects(shootableLimbMeshes, false);

    const beamOrigin = new Vector3();
    this.player.weaponGroup.getWorldPosition(beamOrigin);
    beamOrigin.add(new Vector3(0, 0.05, 0));

    let beamTarget = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(30));

    if (hits.length > 0) {
      const hit = hits[0];
      beamTarget = hit.point;
      const hitMesh = hit.object as LimbMesh;
      const enemy = hitMesh.enemyRef as Enemy | undefined;

      if (enemy) {
        const hitNormal = hit.face ? hit.face.normal : new Vector3(0, 1, 0);
        if (!enemy.isDead) {
          if (hitMesh.limbType === 'torso') {
            enemy.takeTorsoDamage(10, hit.point, hitNormal);
            this.showPrompt('¡Corta las extremidades! El torso absorbe el daño');
          } else {
            hitMesh.limbHp = (hitMesh.limbHp || 25) - 35;
            if (hitMesh.limbHp <= 0) {
              if (enemy.severLimb) enemy.severLimb(hitMesh.limbType, hitNormal);
              this.statsLimbs++;
              if (enemy.isDead && !enemy.killCounted) {
                enemy.killCounted = true;
                this.statsKills++;
              }
              this.updateThreatCounter();
            } else {
              this.bloodSys.spawnSplatter(hit.point, hitNormal, 15);
            }
          }
        } else if (enemy.type === 'exploder' && hitMesh.limbType === 'explosive_sac' && !enemy.exploded) {
          // Detonate sac of dead exploder lying on floor or standing!
          (enemy as Exploder).explode(true);
        }
      }
    }

    this.createPlasmaBeamTracer(beamOrigin, beamTarget);
  }

  createPlasmaBeamTracer(start: Vector3, end: Vector3): void {
    const geom = new BufferGeometry().setFromPoints([start, end]);
    const mat = new LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });
    const line = new Line(geom, mat);
    this.scene.add(line);

    const muzzleLight = new PointLight(0x00f0ff, 4.0, 5.0);
    muzzleLight.position.copy(start);
    this.scene.add(muzzleLight);

    setTimeout(() => {
      this.scene.remove(line);
      this.scene.remove(muzzleLight);
    }, 60);
  }

  checkPickupsAndEscape(): void {
    const pPos = this.player.root.position;

    this.level.pickups.forEach(item => {
      if (!item.picked) {
        const d = pPos.distanceTo(item.group.position);
        if (d < 1.4) {
          item.picked = true;
          this.scene.remove(item.group);

          if (item.type === 'ammo') {
            this.player.reserveAmmo += 15;
            this.player.updateHoloAmmo();
            this.showPrompt('+15 Células de Plasma recogidas');
          } else if (item.type === 'stasis') {
            this.player.rechargeStasis(3);
            this.showPrompt('+3 Cargas de Estabilización recargadas');
          } else {
            this.player.medkits++;
            const medkitEl = document.getElementById('medkit-count');
            if (medkitEl) medkitEl.textContent = String(this.player.medkits);
            this.showPrompt('+1 Botiquín RIG recogido');
          }
          this.sound.playFlashlight();
        }
      }
    });

    if (!this.gameWon && this.level.escapeZone) {
      const dist = pPos.distanceTo(this.level.escapeZone.center);
      if (dist < this.level.escapeZone.radius) {
        this.triggerVictory();
      }
    }
  }

  updateThreatCounter(): void {
    const alive = this.enemies.filter(e => !e.isDead).length;
    const el = document.getElementById('enemies-alive-count');
    if (el) el.textContent = `${alive}`;
  }

  showPrompt(msg: string): void {
    const bar = document.getElementById('prompt-bar');
    const txt = document.getElementById('prompt-message');
    if (bar && txt) {
      txt.textContent = msg;
      bar.classList.remove('prompt-bar-hidden');
      if (this.promptTimeout) clearTimeout(this.promptTimeout);
      this.promptTimeout = setTimeout(() => {
        bar.classList.add('prompt-bar-hidden');
      }, 2500);
    }
  }

  // ───────────────────────────── Holographic menu flow ─────────────────────────────

  setupMenus(): void {
    const menuRoot = document.getElementById('holo-menu') as HTMLElement;
    this.menu = new HoloMenu(menuRoot, this.sound);

    this.menuCtx = {
      startMission: () => this.startMission(),
      resume: () => this.resumeGame(),
      restart: () => window.location.reload(),
      back: () => this.menu.back(),
      getSettings: () => this.settings,
      saveSettings: (partial) => this.saveSettings(partial),
      getStats: () => ({ kills: this.statsKills, limbs: this.statsLimbs })
    };

    // Losing pointer lock mid-mission (Esc, alt-tab, focus loss) opens the pause menu
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) this.openPause();
    });

    document.body.classList.add('in-main-menu');
    this.menu.open(buildMainMenu(this.menuCtx), 'main');
  }

  startMission(): void {
    this.sound.init();
    this.sound.resume();
    this.missionStarted = true;
    this.isPaused = false;
    // Snap the camera back behind Isaac after the main-menu orbit
    this.cameraController.yaw = this.player.root.rotation.y;
    this.cameraController.pitch = 0;
    this.resetInputState();
    this.menu.close();
    document.body.classList.remove('in-main-menu');
    this.clock.getDelta(); // discard menu time
    this.container.requestPointerLock();
  }

  handleEscape(): void {
    // While a menu is open, HoloMenu consumes Esc itself (back / resume)
    if (this.menu && this.menu.isOpen) return;
    this.openPause();
  }

  openPause(): void {
    if (!this.missionStarted || this.isPaused || this.player.isDead || this.gameWon) return;
    this.isPaused = true;
    this.resetInputState();
    if (document.pointerLockElement) document.exitPointerLock();
    this.menu.open(buildPauseMenu(this.menuCtx), 'pause', {
      onBackAtRoot: () => this.resumeGame()
    });
  }

  resumeGame(): void {
    if (!this.isPaused || !this.missionStarted || this.endScreenShown) return;
    this.menu.close();
    this.isPaused = false;
    this.resetInputState();
    this.clock.getDelta(); // discard the time spent paused
    this.container.requestPointerLock();
  }

  resetInputState(): void {
    const s = this.input.state;
    s.forward = s.backward = s.strafeLeft = s.strafeRight = s.sprint = s.aiming = false;
    this.handleAimChange(false);
  }

  triggerGameOver(): void {
    if (this.endScreenShown) return;
    this.endScreenShown = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.menu.open(buildDeathMenu(this.menuCtx), 'end');
  }

  triggerVictory(): void {
    if (this.endScreenShown) return;
    this.gameWon = true;
    this.endScreenShown = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.menu.open(buildVictoryMenu(this.menuCtx), 'end');
  }

  animate(): void {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    if (this.isPaused && !this.missionStarted) {
      // Main menu backdrop: slow cinematic orbit around Isaac in the start room
      this.level.update(dt, elapsedTime);
      this.cameraController.yaw += dt * 0.07;
      this.cameraController.update(dt, this.level.colliders);
    }

    if (!this.isPaused) {
      this.level.update(dt, elapsedTime);
      this.player.update(dt, this.input.state, this.level.colliders);
      this.cameraController.update(dt, this.level.colliders);

      // Update Stasis Projectiles
      for (let i = this.stasisProjectiles.length - 1; i >= 0; i--) {
        const proj = this.stasisProjectiles[i];
        proj.life -= dt;
        const moveStep = proj.dir.clone().multiplyScalar(proj.speed * dt);
        proj.group.position.add(moveStep);
        proj.group.rotation.x += dt * 8;
        proj.group.rotation.y += dt * 8;

        let hit = false;
        const hitPos = proj.group.position.clone();

        // Check collision against living enemies
        for (let e = 0; e < this.enemies.length; e++) {
          const enemy = this.enemies[e];
          if (!enemy.isDead) {
            const enemyCenter = enemy.root.position.clone().add(new Vector3(0, 0.9, 0));
            if (enemyCenter.distanceTo(proj.group.position) < 1.35) {
              hit = true;
              hitPos.copy(proj.group.position);
              enemy.applyStasis(5.0, 0.5);

              // 2.2m AoE splash for clustered enemies
              this.enemies.forEach(other => {
                if (!other.isDead && other !== enemy) {
                  if (other.root.position.distanceTo(hitPos) <= 2.2) {
                    other.applyStasis(5.0, 0.5);
                  }
                }
              });

              this.sound.playStasisHit();
              this.bloodSys.spawnStasisSparks(hitPos, 30);
              break;
            }
          }
        }

        // Check collision against level colliders
        if (!hit) {
          const pBox = new Box3().setFromCenterAndSize(proj.group.position, new Vector3(0.3, 0.3, 0.3));
          for (let c = 0; c < this.level.colliders.length; c++) {
            if (pBox.intersectsBox(this.level.colliders[c])) {
              hit = true;
              this.bloodSys.spawnStasisSparks(hitPos, 14);
              break;
            }
          }
        }

        if (hit || proj.life <= 0) {
          this.scene.remove(proj.group);
          this.stasisProjectiles.splice(i, 1);
        }
      }

      this.enemies.forEach(enemy => {
        enemy.update(dt, this.player, this.level.colliders);
      });

      for (let i = this.gibs.length - 1; i >= 0; i--) {
        if (!this.gibs[i].update(dt, this.level.colliders)) {
          this.gibs.splice(i, 1);
        }
      }

      this.bloodSys.update(dt);
      this.checkPickupsAndEscape();

      if (this.player.isDead && !this.endScreenShown) {
        this.triggerGameOver();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
