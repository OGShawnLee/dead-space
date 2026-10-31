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
  container: HTMLElement;
  enemies: Enemy[];
  gibs: GibPart[];
  stasisProjectiles: StasisProjectile[];
  statsKills: number;
  statsLimbs: number;
  isPaused: boolean;
  gameWon: boolean;
  settingsPreviousModal: 'start' | 'pause';

  scene!: Scene;
  camera!: PerspectiveCamera;
  renderer!: WebGLRenderer;
  ambientLight!: AmbientLight;

  sound: SoundSystem;
  level: ShipLevel;
  bloodSys: BloodParticleSystem;
  player: Player;
  cameraController: ThirdPersonCamera;
  settings: CameraSettings;
  input: InputManager;
  clock: Clock;
  promptTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    this.container = document.getElementById('game-container') as HTMLElement;
    this.enemies = [];
    this.gibs = [];
    this.stasisProjectiles = [];
    this.statsKills = 0;
    this.statsLimbs = 0;
    this.isPaused = false;
    this.gameWon = false;
    this.settingsPreviousModal = 'start';

    this.initThree();
    this.sound = new SoundSystem();
    this.level = new ShipLevel(this.scene);
    this.bloodSys = new BloodParticleSystem(this.scene);

    this.player = new Player(this.scene, this.sound, this.level.playerStart);
    this.cameraController = new ThirdPersonCamera(this.camera, this.player, this.scene, this.container);

    this.settings = this.loadSettings();
    this.cameraController.setSettings(this.settings);

    this.input = new InputManager({
      onToggleFlashlight: () => this.handleToggleFlashlight(),
      onReload: () => this.handleReload(),
      onHeal: () => this.handleHeal(),
      onTogglePause: () => this.togglePause(),
      onAimChange: (aiming) => this.handleAimChange(aiming),
      onShoot: () => this.shootPlasmaCutter(),
      onStasis: () => this.handleStasisFire()
    });

    this.spawnEnemies();
    this.setupUI();

    this.clock = new Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  loadSettings(): CameraSettings {
    try {
      const saved = localStorage.getItem('deadspace_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load settings from localStorage', e);
    }
    return {
      invertY: false,
      invertX: false,
      sensitivity: 1.0
    };
  }

  saveSettings(partial: Partial<CameraSettings>): void {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem('deadspace_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage', e);
    }
    this.cameraController.setSettings(this.settings);
  }

  openSettings(fromModal: 'start' | 'pause'): void {
    this.settingsPreviousModal = fromModal;
    if (fromModal === 'start') {
      const startModal = document.getElementById('start-screen');
      if (startModal) startModal.classList.remove('active');
    } else if (fromModal === 'pause') {
      const pauseModal = document.getElementById('pause-screen');
      if (pauseModal) pauseModal.classList.remove('active');
    }

    const chkY = document.getElementById('setting-invert-y') as HTMLInputElement | null;
    const chkX = document.getElementById('setting-invert-x') as HTMLInputElement | null;
    const rngSens = document.getElementById('setting-sensitivity') as HTMLInputElement | null;
    const sensVal = document.getElementById('setting-sens-val');

    if (chkY) chkY.checked = !!this.settings.invertY;
    if (chkX) chkX.checked = !!this.settings.invertX;
    if (rngSens) rngSens.value = String(this.settings.sensitivity || 1.0);
    if (sensVal) sensVal.textContent = `${Number(this.settings.sensitivity || 1.0).toFixed(1)}x`;

    const settingsModal = document.getElementById('settings-screen');
    if (settingsModal) settingsModal.classList.add('active');
  }

  closeSettings(): void {
    const settingsModal = document.getElementById('settings-screen');
    if (settingsModal) settingsModal.classList.remove('active');

    if (this.settingsPreviousModal === 'pause') {
      const pauseModal = document.getElementById('pause-screen');
      if (pauseModal) pauseModal.classList.add('active');
    } else {
      const startModal = document.getElementById('start-screen');
      if (startModal) startModal.classList.add('active');
    }
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
    if (this.player.isDead || this.gameWon) return;
    const on = this.player.toggleFlashlight();
    const flBadge = document.getElementById('flashlight-status');
    if (flBadge) {
      flBadge.textContent = on ? 'ON' : 'OFF';
      flBadge.className = on ? 'supply-value status-active' : 'supply-value';
    }
  }

  handleReload(): void {
    if (this.player.isDead || this.gameWon) return;
    if (this.player.reload()) {
      this.showPrompt('Recargando Cortador de Plasma...');
    } else if (this.player.reserveAmmo <= 0) {
      this.showPrompt('¡Sin células de plasma de reserva!');
    }
  }

  handleHeal(): void {
    if (this.player.isDead || this.gameWon) return;
    if (this.player.heal()) {
      const medkitEl = document.getElementById('medkit-count');
      if (medkitEl) medkitEl.textContent = String(this.player.medkits);
      this.showPrompt('+50 Salud inyectada');
    } else if (this.player.medkits <= 0) {
      this.showPrompt('¡No tienes botiquines!');
    }
  }

  handleAimChange(aiming: boolean): void {
    if (this.player.isDead || this.gameWon) return;
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
    if (!this.cameraController.isLocked || this.player.isDead || this.gameWon) return;

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

  togglePause(): void {
    const settingsModal = document.getElementById('settings-screen');
    if (settingsModal && settingsModal.classList.contains('active')) {
      this.closeSettings();
      return;
    }

    this.isPaused = !this.isPaused;
    const modal = document.getElementById('pause-screen');
    if (modal) {
      if (this.isPaused) {
        modal.classList.add('active');
        document.exitPointerLock();
      } else {
        modal.classList.remove('active');
        this.container.requestPointerLock();
      }
    }
  }

  triggerGameOver(): void {
    document.exitPointerLock();
    const deathModal = document.getElementById('death-screen');
    if (deathModal) deathModal.classList.add('active');
  }

  triggerVictory(): void {
    this.gameWon = true;
    document.exitPointerLock();
    const winModal = document.getElementById('victory-screen');
    if (winModal) {
      const killsEl = document.getElementById('stat-kills');
      const limbsEl = document.getElementById('stat-limbs');
      if (killsEl) killsEl.textContent = `${this.statsKills}`;
      if (limbsEl) limbsEl.textContent = `${this.statsLimbs}`;
      winModal.classList.add('active');
    }
  }

  setupUI(): void {
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        this.sound.init();
        this.sound.resume();
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.remove('active');
        this.container.requestPointerLock();
      });
    }

    const btnResume = document.getElementById('btn-resume');
    if (btnResume) {
      btnResume.addEventListener('click', () => {
        this.togglePause();
      });
    }

    const btnSettingsStart = document.getElementById('btn-settings-start');
    if (btnSettingsStart) {
      btnSettingsStart.addEventListener('click', () => this.openSettings('start'));
    }

    const btnSettingsPause = document.getElementById('btn-settings-pause');
    if (btnSettingsPause) {
      btnSettingsPause.addEventListener('click', () => this.openSettings('pause'));
    }

    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => this.closeSettings());
    }

    const chkY = document.getElementById('setting-invert-y');
    if (chkY) {
      chkY.addEventListener('change', (e: Event) => {
        this.saveSettings({ invertY: (e.target as HTMLInputElement).checked });
      });
    }

    const chkX = document.getElementById('setting-invert-x');
    if (chkX) {
      chkX.addEventListener('change', (e: Event) => {
        this.saveSettings({ invertX: (e.target as HTMLInputElement).checked });
      });
    }

    const rngSens = document.getElementById('setting-sensitivity');
    const sensVal = document.getElementById('setting-sens-val');
    if (rngSens) {
      rngSens.addEventListener('input', (e: Event) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (sensVal) sensVal.textContent = `${val.toFixed(1)}x`;
        this.saveSettings({ sensitivity: val });
      });
    }

    const reloadGame = (): void => window.location.reload();
    const restartPause = document.getElementById('btn-restart-pause');
    if (restartPause) restartPause.addEventListener('click', reloadGame);
    const restartDeath = document.getElementById('btn-restart-death');
    if (restartDeath) restartDeath.addEventListener('click', reloadGame);
    const restartVictory = document.getElementById('btn-restart-victory');
    if (restartVictory) restartVictory.addEventListener('click', reloadGame);
  }

  animate(): void {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

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
        if (!this.gibs[i].update(dt)) {
          this.gibs.splice(i, 1);
        }
      }

      this.bloodSys.update(dt);
      this.checkPickupsAndEscape();

      const deathScreen = document.getElementById('death-screen');
      if (this.player.isDead && deathScreen && !deathScreen.classList.contains('active')) {
        this.triggerGameOver();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
