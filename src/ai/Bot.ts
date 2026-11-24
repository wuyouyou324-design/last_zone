import { AIPersonality, BotState, WeaponSpec } from '../types/game';
import { WEAPON_CATALOG } from '../systems/Inventory';
import { PERSONALITY_SEQUENCE } from './AIConfig';
import { BuildingNavWaypoint } from './BuildingNav';

export interface BotMemoryPosition {
  valid: boolean;
  x: number;
  y: number;
  z: number;
  timestamp: number;
  sourceId: string | null;
}

export interface BotEntity {
  id: string;
  name: string;
  personality: AIPersonality;
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
  targetY: number;
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

  // Multi-story floor-aware navigation state
  navPath: BuildingNavWaypoint[];
  navRepathTimer: number;
  stuckTimer: number;
  stuckAnchorX: number;
  stuckAnchorY: number;
  stuckAnchorZ: number;

  // Perception, memory, reaction, and anti-focus-fire state
  perceptionTimer: number;
  reactionTimer: number;
  targetSwitchCooldown: number;
  lastSeenTargetAt: number;
  lostSightGraceTimer: number;
  lastKnownTargetPos: BotMemoryPosition;
  heardSoundPos: BotMemoryPosition;
  lastDamageFromId: string | null;
  lastDamagedAt: number;
  burstShotsLeft: number;
  burstPauseTimer: number;
  currentlyEngagingPlayer: boolean;
  visibleEnemyIds: Set<string>;
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
  const personality = PERSONALITY_SEQUENCE[index % PERSONALITY_SEQUENCE.length];

  return {
    id: `bot-${index + 1}`,
    name: BOT_NAMES[index % BOT_NAMES.length],
    personality,
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
    targetY: y,
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

    navPath: [],
    navRepathTimer: 0,
    stuckTimer: 0,
    stuckAnchorX: x,
    stuckAnchorY: y,
    stuckAnchorZ: z,

    perceptionTimer: (index % 6) * 0.02, // staggered initial perception across frames
    reactionTimer: 0,
    targetSwitchCooldown: 0,
    lastSeenTargetAt: -100,
    lostSightGraceTimer: 0,
    lastKnownTargetPos: {
      valid: false,
      x: 0,
      y: 0,
      z: 0,
      timestamp: -100,
      sourceId: null,
    },
    heardSoundPos: {
      valid: false,
      x: 0,
      y: 0,
      z: 0,
      timestamp: -100,
      sourceId: null,
    },
    lastDamageFromId: null,
    lastDamagedAt: -100,
    burstShotsLeft: 3,
    burstPauseTimer: 0,
    currentlyEngagingPlayer: false,
    visibleEnemyIds: new Set<string>(),
  };
}
