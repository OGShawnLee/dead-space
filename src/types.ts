import type { Mesh, Vector3, Group } from 'three';

export type LimbType = 'head' | 'torso' | 'arm_left' | 'arm_right' | 'leg_left' | 'leg_right' | 'explosive_sac' | 'tail';

export interface LimbMesh extends Mesh {
  isLimb?: boolean;
  limbType?: LimbType;
  limbHp?: number;
  enemyRef?: any;
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  aiming: boolean;
  sprint: boolean;
}

export interface InputHandlers {
  onToggleFlashlight?: () => void;
  onReload?: () => void;
  onHeal?: () => void;
  onTogglePause?: () => void;
  onAimChange?: (aiming: boolean) => void;
  onShoot?: () => void;
  onStasis?: () => void;
}

export interface CameraSettings {
  invertY: boolean;
  invertX: boolean;
  sensitivity: number;
  /** Master audio volume 0..1 (optional for backwards-compatible saved settings) */
  volume?: number;
}

export interface PickupItem {
  group: Group;
  type: 'ammo' | 'medkit' | 'stasis';
  picked: boolean;
  rotSpeed: number;
}

export interface EscapeZone {
  center: Vector3;
  radius: number;
}
