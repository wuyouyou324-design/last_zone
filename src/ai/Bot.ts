import { BotState, WeaponSpec } from '../types/game';
import { WEAPON_CATALOG } from '../systems/Inventory';

export interface BotEntity {
  id: string;
  name: string;
  x: number;
  y: number; // feet Y
  z: number;
  yaw: number;
  health: number;
  maxHealth: number;
  armor: number;
  state: BotState;
  weapon: WeaponSpec;
  targetX: number;
  targetZ: number;
  targetEnemyId: string | null;
  stateTimer: number;
  fireCooldown: number;
  healCooldown: number;
  stridePhase: number;
  isMoving: boolean;
  moveSpeed: number;
  isSprinting: boolean;
  isAiming: boolean;
  hitReactionToken: number;
  variantIndex: number;
  lastFiredAt: number;
  colliderHandle: number;
}

const BOT_NAMES = [
  'Kestrel-01',
  'Vanguard-02',
  'Nomad-03',
  'Warden-04',
  'Talon-05',
  'Rook-06',
  'Specter-07',
  'Atlas-08',
  'Cipher-09',
  'Strider-10',
  'Sentinel-11',
];

export function createBotEntity(
  index: number,
  x: number,
  y: number,
  z: number,
  colliderHandle: number,
): BotEntity {
  const starterWeapons = [WEAPON_CATALOG.vx47, WEAPON_CATALOG.mr12, WEAPON_CATALOG.sg8, WEAPON_CATALOG.p9];
  const weapon = starterWeapons[index % starterWeapons.length];

  return {
    id: `bot-${index + 1}`,
    name: BOT_NAMES[index % BOT_NAMES.length],
    x,
    y,
    z,
    yaw: Math.random() * Math.PI * 2,
    health: 100,
    maxHealth: 100,
    armor: index % 2 === 0 ? 45 : 20,
    state: 'Idle',
    weapon,
    targetX: x,
    targetZ: z,
    targetEnemyId: null,
    stateTimer: 0.8 + Math.random() * 1.4,
    fireCooldown: 0.5 + Math.random() * 0.6,
    healCooldown: 0,
    stridePhase: Math.random() * 6,
    isMoving: false,
    moveSpeed: 0,
    isSprinting: false,
    isAiming: false,
    hitReactionToken: 0,
    variantIndex: index,
    lastFiredAt: -10,
    colliderHandle,
  };
}
