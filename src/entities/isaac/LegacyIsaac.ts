import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  CylinderGeometry,
  Vector3,
  type BufferGeometry,
  type CanvasTexture,
  type Line,
  type LineBasicMaterial,
  type Object3D,
  type PlaneGeometry,
  type PointLight,
  type SpotLight
} from 'three';
import { TextureFactory } from '../../graphics/TextureFactory';
import { PALETTE } from '../../graphics/Palette';
import type { IsaacAnimState, IsaacView } from './IsaacView';
import {
  applyProximityOpacity,
  buildAimLaser,
  buildAmmoHologram,
  buildFlashlight,
  buildRigBackLight,
  buildStasisGauge
} from './IsaacTech';

/**
 * The original box Isaac, kept behind `?isaac=legacy` for A/B comparison until the
 * owner approves the new model (Proposal 005, phase 8 deletes it). Geometry and
 * posing are unchanged; only the tech colors moved to `rig.*`.
 */
export class LegacyIsaac implements IsaacView {
  readonly root = new Group();
  readonly armL: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly weaponGroup = new Group();
  readonly rigSegments: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  readonly stasisSegmentMats: MeshBasicMaterial[];
  readonly stasisLight: PointLight;
  readonly rigBackLight: PointLight;
  readonly ammoCanvas: HTMLCanvasElement;
  readonly ammoTexture: CanvasTexture;
  readonly holoScreen: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly holoLight: PointLight;
  readonly laserLine: Line<BufferGeometry, LineBasicMaterial>;
  readonly spotLight: SpotLight;
  readonly spotTarget: Object3D;

  private armR: Mesh<BoxGeometry, MeshStandardMaterial>;
  private legL: Mesh<BoxGeometry, MeshStandardMaterial>;
  private legR: Mesh<BoxGeometry, MeshStandardMaterial>;
  private currentOpacity = 1;

  constructor(parent: Object3D, ammo: number, maxAmmo: number) {
    parent.add(this.root);
    const suit = this.root;

    const suitMat = new MeshStandardMaterial({
      map: TextureFactory.createSuitTexture(),
      roughness: 0.45,
      metalness: 0.65
    });
    const darkMetalMat = new MeshStandardMaterial({ color: PALETTE.metal.m700, roughness: 0.7, metalness: 0.8 });

    const add = (geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      suit.add(m);
      return m;
    };

    // Torso, chest plate, helmet
    add(new BoxGeometry(0.65, 0.75, 0.4), suitMat, 0, 1.15, 0).castShadow = true;
    add(new BoxGeometry(0.55, 0.4, 0.1), darkMetalMat, 0, 1.25, 0.22);
    add(new BoxGeometry(0.4, 0.42, 0.42), suitMat, 0, 1.72, 0);

    // Visor slits
    const visorMat = new MeshBasicMaterial({ color: PALETTE.rig.ok });
    for (let i = 0; i < 3; i++) add(new BoxGeometry(0.24, 0.025, 0.05), visorMat, 0, 1.74 - i * 0.05, 0.215);

    // RIG pack, spine bracket and 6 glowing vertebrae
    add(new BoxGeometry(0.38, 0.68, 0.12), darkMetalMat, 0, 1.15, -0.26);
    add(new BoxGeometry(0.14, 0.62, 0.06), darkMetalMat, 0, 1.15, -0.32);
    const segH = 0.07;
    const segGap = 0.025;
    for (let i = 0; i < 6; i++) {
      const seg = add(new BoxGeometry(0.09, segH, 0.12), new MeshBasicMaterial({ color: PALETTE.rig.ok }), 0, 0.88 + i * (segH + segGap), -0.36);
      this.rigSegments.push(seg as Mesh<BufferGeometry, MeshBasicMaterial>);
    }

    // Stasis shoulder plate + gauge
    add(new BoxGeometry(0.18, 0.22, 0.09), darkMetalMat, 0.17, 1.38, -0.28);
    const gauge = buildStasisGauge(suit, new Vector3(0.17, 1.38, -0.33), darkMetalMat, suitMat);
    this.stasisSegmentMats = gauge.mats;
    this.stasisLight = gauge.light;
    this.rigBackLight = buildRigBackLight(suit, new Vector3(0, 1.15, -0.45));

    // Limbs
    const legGeo = new BoxGeometry(0.24, 0.75, 0.24);
    this.legL = add(legGeo, suitMat, -0.2, 0.4, 0) as Mesh<BoxGeometry, MeshStandardMaterial>;
    this.legR = add(legGeo, suitMat, 0.2, 0.4, 0) as Mesh<BoxGeometry, MeshStandardMaterial>;
    const armGeo = new BoxGeometry(0.2, 0.65, 0.2);
    this.armL = add(armGeo, suitMat, -0.45, 1.15, 0) as Mesh<BoxGeometry, MeshStandardMaterial>;
    this.armR = add(armGeo, suitMat, 0.45, 1.15, 0) as Mesh<BoxGeometry, MeshStandardMaterial>;

    // Plasma Cutter
    this.weaponGroup.position.set(0.48, 1.05, 0.35);
    const metalMat = new MeshStandardMaterial({ color: PALETTE.metal.m500, metalness: 0.8, roughness: 0.3 });
    this.weaponGroup.add(new Mesh(new BoxGeometry(0.12, 0.18, 0.4), metalMat));
    const emitter = new Mesh(new CylinderGeometry(0.04, 0.04, 0.08, 8), metalMat);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0, 0.24);
    this.weaponGroup.add(emitter);
    const holo = buildAmmoHologram(this.weaponGroup, new Vector3(0.17, 0.2, 0), ammo, maxAmmo);
    this.ammoCanvas = holo.ammoCanvas;
    this.ammoTexture = holo.ammoTexture;
    this.holoScreen = holo.holoScreen;
    this.holoLight = holo.holoLight;
    this.laserLine = buildAimLaser(this.weaponGroup, new Vector3(0, 0, 0.24));
    suit.add(this.weaponGroup);

    const flash = buildFlashlight(suit, parent, new Vector3(0.28, 1.62, 0.15));
    this.spotLight = flash.spotLight;
    this.spotTarget = flash.spotTarget;
  }

  update(_dt: number, s: IsaacAnimState): void {
    if (s.aiming) {
      this.weaponGroup.position.set(0.3, 1.35, 0.6);
      this.armR.position.set(0.3, 1.35, 0.3);
      this.armR.rotation.x = -Math.PI / 2.2;
    } else {
      this.weaponGroup.position.set(0.48, 1.05, 0.35);
      this.armR.position.set(0.45, 1.15, 0);
      this.armR.rotation.x = 0;
    }

    if (s.stasisT > 0) {
      this.armL.position.set(-0.35, 1.35, 0.35);
      this.armL.rotation.x = -Math.PI / 2.2;
    } else if (s.aiming) {
      this.armL.position.set(-0.35, 1.2, 0.15);
      this.armL.rotation.x = -Math.PI / 4.5;
    } else {
      this.armL.position.set(-0.45, 1.15, 0);
    }

    const freeArm = !s.aiming && s.stasisT <= 0;
    if (s.speed > 0) {
      const sway = Math.sin(Date.now() * 0.01 * (s.sprint ? 1.4 : 1.0)) * 0.4;
      this.legL.rotation.x = sway;
      this.legR.rotation.x = -sway;
      if (freeArm) this.armL.rotation.x = -sway * 0.7;
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      if (freeArm) this.armL.rotation.x = 0;
    }
  }

  setProximityOpacity(opacity: number): void {
    if (Math.abs(this.currentOpacity - opacity) < 0.01) return;
    this.currentOpacity = opacity;
    applyProximityOpacity([this.root], opacity, this.holoScreen, this.laserLine);
  }

  playDeath(): void {
    this.root.rotation.x = -Math.PI / 2.2;
    this.root.position.y = 0.2;
  }
}
