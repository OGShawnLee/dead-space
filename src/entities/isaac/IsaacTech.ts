import {
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Line,
  LineBasicMaterial,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SpotLight,
  TorusGeometry,
  Vector3,
  type Material
} from 'three';
import { TextureFactory } from '../../graphics/TextureFactory';
import { PALETTE } from '../../graphics/Palette';

/**
 * Isaac's tech parts shared by every visual model (legacy and new): ammo hologram,
 * aim laser, stasis gauge, RIG back light and shoulder flashlight. Colors start at
 * the `rig.ok` state; `Player` recolors them from gameplay state.
 */

export interface AmmoHologram {
  ammoCanvas: HTMLCanvasElement;
  ammoTexture: CanvasTexture;
  holoScreen: Mesh<PlaneGeometry, MeshBasicMaterial>;
  holoLight: PointLight;
}

/** Floating ammo counter screen (0.38 x 0.19 m) plus its glow light, added to `weapon`. */
export function buildAmmoHologram(weapon: Object3D, screenPos: Vector3, ammo: number, maxAmmo: number): AmmoHologram {
  const ammoCanvas = TextureFactory.createHoloAmmoCanvas(ammo, maxAmmo);
  const ammoTexture = new CanvasTexture(ammoCanvas);
  ammoTexture.magFilter = LinearFilter;
  ammoTexture.minFilter = LinearFilter;

  const holoScreen = new Mesh(
    new PlaneGeometry(0.38, 0.19),
    new MeshBasicMaterial({
      map: ammoTexture,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
      depthWrite: false,
      // Never clipped by Isaac's arm/torso; the screen is a projected overlay on the weapon
      depthTest: false
    })
  );
  holoScreen.position.copy(screenPos);
  holoScreen.rotation.set(0, Math.PI, 0); // faces the camera behind Isaac
  holoScreen.renderOrder = 10;
  weapon.add(holoScreen);

  const holoLight = new PointLight(PALETTE.rig.ok, 0.5, 1.5);
  holoLight.position.copy(screenPos);
  weapon.add(holoLight);

  return { ammoCanvas, ammoTexture, holoScreen, holoLight };
}

/** Aim laser from the emitter along +Z (hidden until aiming). */
export function buildAimLaser(weapon: Object3D, emitterPos: Vector3): Line<BufferGeometry, LineBasicMaterial> {
  const laser = new Line(
    new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 0, 25)]),
    new LineBasicMaterial({ color: PALETTE.rig.ok, linewidth: 2, transparent: true, opacity: 0.85 })
  );
  laser.position.copy(emitterPos);
  laser.visible = false;
  weapon.add(laser);
  return laser;
}

export interface StasisGauge {
  segments: Mesh<TorusGeometry, MeshBasicMaterial>[];
  mats: MeshBasicMaterial[];
  light: PointLight;
}

/**
 * Circular stasis socket with 3 glowing arcs. `center` is the socket face on the back;
 * the gauge faces -Z (toward the camera behind Isaac).
 */
export function buildStasisGauge(parent: Object3D, center: Vector3, hardware: Material, pin: Material): StasisGauge {
  const at = (dz: number) => new Vector3(center.x, center.y, center.z + dz);

  const socket = new Mesh(new CylinderGeometry(0.078, 0.082, 0.025, 24), hardware);
  socket.rotation.x = Math.PI / 2;
  socket.position.copy(at(0));
  parent.add(socket);

  const node = new Mesh(new CylinderGeometry(0.038, 0.04, 0.03, 24), hardware);
  node.rotation.x = Math.PI / 2;
  node.position.copy(at(-0.02));
  parent.add(node);

  const nodePin = new Mesh(new CylinderGeometry(0.016, 0.018, 0.012, 16), pin);
  nodePin.rotation.x = Math.PI / 2;
  nodePin.position.copy(at(-0.036));
  parent.add(nodePin);

  const groove = new Mesh(
    new TorusGeometry(0.058, 0.008, 8, 32),
    new MeshStandardMaterial({ color: PALETTE.metal.m900, roughness: 0.85, metalness: 0.6 })
  );
  groove.position.copy(at(-0.015));
  parent.add(groove);

  // 3 arcs over a ~320 degree horseshoe, opening toward the neck
  const count = 3;
  const totalArc = Math.PI * 1.78;
  const gap = 0.1;
  const segArc = (totalArc - (count - 1) * gap) / count;
  const startAngle = Math.PI * 0.85;
  const segments: Mesh<TorusGeometry, MeshBasicMaterial>[] = [];
  const mats: MeshBasicMaterial[] = [];
  for (let i = 0; i < count; i++) {
    const mat = new MeshBasicMaterial({ color: PALETTE.rig.ok });
    const seg = new Mesh(new TorusGeometry(0.058, 0.0075, 8, 20, segArc), mat);
    seg.position.copy(at(-0.025));
    seg.rotation.z = startAngle + i * (segArc + gap);
    parent.add(seg);
    segments.push(seg);
    mats.push(mat);
  }

  const light = new PointLight(PALETTE.rig.glow, 1.4, 2.2);
  light.position.copy(at(-0.09));
  parent.add(light);

  return { segments, mats, light };
}

/** Aura light behind the RIG spine. */
export function buildRigBackLight(parent: Object3D, pos: Vector3): PointLight {
  const light = new PointLight(PALETTE.rig.glow, 1.5, 2.5);
  light.position.copy(pos);
  parent.add(light);
  return light;
}

/**
 * Shoulder flashlight (the only shadow-casting light). The target lives under the
 * player root so it follows yaw but not body animation.
 */
export function buildFlashlight(parent: Object3D, targetParent: Object3D, pos: Vector3): { spotLight: SpotLight; spotTarget: Object3D } {
  const spotLight = new SpotLight(PALETTE.light.flashlight, 4.5, 30, Math.PI / 6, 0.35, 1.2);
  spotLight.position.copy(pos);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 1024;
  spotLight.shadow.mapSize.height = 1024;
  spotLight.shadow.camera.near = 0.5;
  spotLight.shadow.camera.far = 30;

  const spotTarget = new Object3D();
  spotTarget.position.set(pos.x, pos.y, 10);
  targetParent.add(spotTarget);
  spotLight.target = spotTarget;

  parent.add(spotLight);
  return { spotLight, spotTarget };
}

/**
 * Camera proximity fade over every material under `groups`. The hologram and laser
 * keep their own base opacity and always stay transparent.
 */
export function applyProximityOpacity(
  groups: Object3D[],
  opacity: number,
  holoScreen: Object3D,
  laserLine: Object3D
): void {
  const apply = (obj: Object3D): void => {
    const material = (obj as Mesh).material;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    const fixed = obj === holoScreen ? 0.95 : obj === laserLine ? 0.85 : -1;
    for (const mat of mats) {
      mat.transparent = fixed > 0 || opacity < 0.99;
      mat.opacity = fixed > 0 ? fixed * opacity : opacity;
      mat.needsUpdate = true;
    }
  };
  for (const g of groups) g.traverse(apply);
}
