import {
  Vector3,
  type BufferGeometry,
  type CanvasTexture,
  type Group,
  type Line,
  type LineBasicMaterial,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type PlaneGeometry,
  type PointLight,
  type SpotLight
} from 'three';

/**
 * Per-frame intent computed by `Player` (gameplay) and consumed by the visual model.
 * Pure data so the animator can be stepped from numeric scripts.
 */
export interface IsaacAnimState {
  /** Local move direction: x = strafe (+X is screen-left / Isaac's left), z = forward. Unit or zero. */
  velocityLocal: Vector3;
  /** Current ground speed in m/s. */
  speed: number;
  /** 0..1 of the sprint speed. */
  speed01: number;
  sprint: boolean;
  aiming: boolean;
  /** Camera pitch in radians (hook for the aim layer, phase 6). */
  aimPitch: number;
  /** Seconds left in the stasis thrust gesture (0 when idle). */
  stasisT: number;
  /** Seconds left in the reload gesture (0 when idle). */
  reloadT: number;
  /** Seconds left in the hurt flinch (0 when idle). */
  hurtT: number;
  dead: boolean;
  flashlight: boolean;
}

export function createAnimState(): IsaacAnimState {
  return {
    velocityLocal: new Vector3(),
    speed: 0,
    speed01: 0,
    sprint: false,
    aiming: false,
    aimPitch: 0,
    stasisT: 0,
    reloadT: 0,
    hurtT: 0,
    dead: false,
    flashlight: true
  };
}

/**
 * What `Player` (and through it Engine and the camera) needs from Isaac's visuals.
 * Implemented by the new `IsaacModel` and by `LegacyIsaac` (`?isaac=legacy`, A/B until approval).
 * Colors of the tech parts are driven by `Player` (RIG spine, stasis gauge, ammo hologram).
 */
export interface IsaacView {
  /** Model root, a child of `player.root` (feet origin, faces +Z). */
  readonly root: Group;
  /** Off-hand (stasis) Object3D; the stasis projectile spawns from its world position. */
  readonly armL: Object3D;
  /** Plasma Cutter group; the beam starts at its world position. Holds the holo screen and laser. */
  readonly weaponGroup: Group;
  /** 6 RIG spine segments, bottom to top. */
  readonly rigSegments: Mesh<BufferGeometry, MeshBasicMaterial>[];
  /** 3 stasis gauge arcs. */
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

  update(dt: number, state: IsaacAnimState): void;
  setProximityOpacity(opacity: number): void;
  playDeath(): void;
}

export type IsaacMode = 'new' | 'legacy';

/** `?isaac=legacy` selects the old box model for A/B comparison. */
export function isaacModeFromQuery(search: string = typeof location !== 'undefined' ? location.search : ''): IsaacMode {
  return new URLSearchParams(search).get('isaac') === 'legacy' ? 'legacy' : 'new';
}
