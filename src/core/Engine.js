const THREE = window.THREE;
import { SoundSystem } from './SoundSystem.js';
import { InputManager } from './InputManager.js';
import { ShipLevel } from '../world/ShipLevel.js';
import { BloodParticleSystem } from '../graphics/BloodParticleSystem.js';
import { Player } from '../entities/Player.js';
import { Necromorph } from '../entities/Necromorph.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';

/**
 * Dead Space Game Engine Core
 * Coordinates scene, rendering, update loop, combat raycasts, and state transitions.
 */
export class DeadSpaceGame {
  constructor() {
    this.container = document.getElementById('game-container');
    this.enemies = [];
    this.gibs = [];
    this.statsKills = 0;
    this.statsLimbs = 0;
    this.isPaused = false;
    this.gameWon = false;

    this.initThree();
    this.sound = new SoundSystem();
    this.level = new ShipLevel(this.scene);
    this.bloodSys = new BloodParticleSystem(this.scene);

    this.player = new Player(this.scene, this.sound, this.level.playerStart);
    this.cameraController = new ThirdPersonCamera(this.camera, this.player, this.scene, this.container);

    this.input = new InputManager({
      onToggleFlashlight: () => this.handleToggleFlashlight(),
      onReload: () => this.handleReload(),
      onHeal: () => this.handleHeal(),
      onTogglePause: () => this.togglePause(),
      onAimChange: (aiming) => this.handleAimChange(aiming),
      onShoot: () => this.shootPlasmaCutter()
    });

    this.spawnEnemies();
    this.setupUI();

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050608, 0.08);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.ambientLight = new THREE.AmbientLight(0x080b12, 0.18);
    this.scene.add(this.ambientLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  spawnEnemies() {
    this.level.spawnPoints.forEach(pos => {
      const necro = new Necromorph(this.scene, this.sound, pos, this.gibs, this.bloodSys);
      this.enemies.push(necro);
    });
    this.updateThreatCounter();
  }

  handleToggleFlashlight() {
    if (this.player.isDead || this.gameWon) return;
    const on = this.player.toggleFlashlight();
    const flBadge = document.getElementById('flashlight-status');
    if (flBadge) {
      flBadge.textContent = on ? 'ON' : 'OFF';
      flBadge.className = on ? 'supply-value status-active' : 'supply-value';
    }
  }

  handleReload() {
    if (this.player.isDead || this.gameWon) return;
    if (this.player.reload()) {
      this.showPrompt('Recargando Cortador de Plasma...');
    } else if (this.player.reserveAmmo <= 0) {
      this.showPrompt('¡Sin células de plasma de reserva!');
    }
  }

  handleHeal() {
    if (this.player.isDead || this.gameWon) return;
    if (this.player.heal()) {
      document.getElementById('medkit-count').textContent = this.player.medkits;
      this.showPrompt('+50 Salud inyectada');
    } else if (this.player.medkits <= 0) {
      this.showPrompt('¡No tienes botiquines!');
    }
  }

  handleAimChange(aiming) {
    if (this.player.isDead || this.gameWon) return;
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      if (aiming) crosshair.classList.remove('crosshair-hidden');
      else crosshair.classList.add('crosshair-hidden');
    }
  }

  shootPlasmaCutter() {
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

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const shootableLimbMeshes = [];
    this.enemies.forEach(enemy => {
      if (!enemy.isDead) {
        enemy.root.traverse(child => {
          if (child.isLimb) shootableLimbMeshes.push(child);
        });
      }
    });

    const hits = raycaster.intersectObjects(shootableLimbMeshes, false);

    const beamOrigin = new THREE.Vector3();
    this.player.weaponGroup.getWorldPosition(beamOrigin);
    beamOrigin.add(new THREE.Vector3(0, 0.05, 0));

    let beamTarget = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(30));

    if (hits.length > 0) {
      const hit = hits[0];
      beamTarget = hit.point;
      const hitMesh = hit.object;
      const enemy = hitMesh.enemyRef;

      if (enemy && !enemy.isDead) {
        if (hitMesh.limbType === 'torso') {
          enemy.takeTorsoDamage(10, hit.point, hit.face.normal);
          this.showPrompt('¡Corta las extremidades! El torso absorbe el daño');
        } else {
          hitMesh.limbHp -= 35;
          if (hitMesh.limbHp <= 0) {
            enemy.severLimb(hitMesh.limbType, hit.face.normal);
            this.statsLimbs++;
            if (enemy.isDead) this.statsKills++;
            this.updateThreatCounter();
          } else {
            this.bloodSys.spawnSplatter(hit.point, hit.face.normal, 15);
          }
        }
      }
    }

    this.createPlasmaBeamTracer(beamOrigin, beamTarget);
  }

  createPlasmaBeamTracer(start, end) {
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });
    const line = new THREE.Line(geom, mat);
    this.scene.add(line);

    const muzzleLight = new THREE.PointLight(0x00f0ff, 4.0, 5.0);
    muzzleLight.position.copy(start);
    this.scene.add(muzzleLight);

    setTimeout(() => {
      this.scene.remove(line);
      this.scene.remove(muzzleLight);
    }, 60);
  }

  checkPickupsAndEscape() {
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
          } else {
            this.player.medkits++;
            document.getElementById('medkit-count').textContent = this.player.medkits;
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

  updateThreatCounter() {
    const alive = this.enemies.filter(e => !e.isDead).length;
    const el = document.getElementById('enemies-alive-count');
    if (el) el.textContent = `${alive}`;
  }

  showPrompt(msg) {
    const bar = document.getElementById('prompt-bar');
    const txt = document.getElementById('prompt-message');
    if (bar && txt) {
      txt.textContent = msg;
      bar.classList.remove('prompt-bar-hidden');
      clearTimeout(this.promptTimeout);
      this.promptTimeout = setTimeout(() => {
        bar.classList.add('prompt-bar-hidden');
      }, 2500);
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    const modal = document.getElementById('pause-screen');
    if (this.isPaused) {
      modal.classList.add('active');
      document.exitPointerLock();
    } else {
      modal.classList.remove('active');
      this.container.requestPointerLock();
    }
  }

  triggerGameOver() {
    document.exitPointerLock();
    const deathModal = document.getElementById('death-screen');
    if (deathModal) deathModal.classList.add('active');
  }

  triggerVictory() {
    this.gameWon = true;
    document.exitPointerLock();
    const winModal = document.getElementById('victory-screen');
    if (winModal) {
      document.getElementById('stat-kills').textContent = `${this.statsKills}`;
      document.getElementById('stat-limbs').textContent = `${this.statsLimbs}`;
      winModal.classList.add('active');
    }
  }

  setupUI() {
    const btnStart = document.getElementById('btn-start');
    btnStart.addEventListener('click', () => {
      this.sound.init();
      this.sound.resume();
      document.getElementById('start-screen').classList.remove('active');
      this.container.requestPointerLock();
    });

    const btnResume = document.getElementById('btn-resume');
    btnResume.addEventListener('click', () => {
      this.togglePause();
    });

    const reloadGame = () => window.location.reload();
    document.getElementById('btn-restart-pause').addEventListener('click', reloadGame);
    document.getElementById('btn-restart-death').addEventListener('click', reloadGame);
    document.getElementById('btn-restart-victory').addEventListener('click', reloadGame);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    if (!this.isPaused) {
      this.level.update(dt, elapsedTime);
      this.player.update(dt, this.input.state, this.level.colliders);
      this.cameraController.update(dt, this.level.colliders);

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

      if (this.player.isDead && !document.getElementById('death-screen').classList.contains('active')) {
        this.triggerGameOver();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
