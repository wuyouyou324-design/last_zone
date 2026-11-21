import type { WeaponModelId } from '../weapons/WeaponModels';

export type CharacterAnimState =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'Crouch'
  | 'Aim'
  | 'Reload'
  | 'Jump'
  | 'HitReaction'
  | 'Elimination';

export type CharacterLodLevel = 0 | 1 | 2;

export interface CharacterEquipmentConfig {
  helmet: boolean;
  goggles: boolean;
  balaclava: boolean;
  vest: boolean;
  backpack: boolean;
}

export interface CharacterAppearanceConfig {
  jacketVariant: number;
  pantsVariant: number;
  helmetVariant: number;
  vestVariant: number;
  backpackVariant: number;
  skinVariant: number;
  equipment: CharacterEquipmentConfig;
}

export interface CharacterMotionState {
  isMoving: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  isGrounded: boolean;
  isAiming: boolean;
  isReloading: boolean;
  isEliminated: boolean;
  moveSpeed: number;
  weaponId: WeaponModelId;
}
