import { AIPersonality, GameDifficulty } from '../types/game';

export interface AICombatBalanceConfig {
  preferredMaxAttackers: number;
  reactionTimeMin: number;
  reactionTimeMax: number;
  targetSwitchCooldown: number;
  lostTargetMemoryDuration: number;
  fovHalfAngleRad: number;
  peripheralRange: number;
  sightRange: number;
  hearingRange: number;
  perceptionInterval: number;
  accuracyScale: number;
  fireIntervalScale: number;
  headshotChance: number;
  burstPauseChance: number;
  focusFirePenalty: number;
  turnSpeedRadPerSec: number;
}

export interface AIPersonalityProfile {
  id: AIPersonality;
  label: string;
  aggressionBias: number;
  investigateSoundChance: number;
  fleeHealthThreshold: number;
  abandonUncertaintyScale: number;
  reactionScale: number;
  switchCooldownScale: number;
  preferredRangeScale: number;
  woundedTargetBonus: number;
  activeCombatantBonus: number;
  searchPersistenceScale: number;
  aimTurnScale: number;
}

export const DIFFICULTY_CONFIGS: Record<GameDifficulty, AICombatBalanceConfig> = {
  easy: {
    preferredMaxAttackers: 1,
    reactionTimeMin: 0.55,
    reactionTimeMax: 0.95,
    targetSwitchCooldown: 3.2,
    lostTargetMemoryDuration: 3.8,
    fovHalfAngleRad: (58 * Math.PI) / 180,
    peripheralRange: 10,
    sightRange: 64,
    hearingRange: 54,
    perceptionInterval: 0.16,
    accuracyScale: 0.52,
    fireIntervalScale: 1.55,
    headshotChance: 0.05,
    burstPauseChance: 0.34,
    focusFirePenalty: 0.86,
    turnSpeedRadPerSec: 4.4,
  },
  normal: {
    preferredMaxAttackers: 2,
    reactionTimeMin: 0.32,
    reactionTimeMax: 0.62,
    targetSwitchCooldown: 2.2,
    lostTargetMemoryDuration: 5.0,
    fovHalfAngleRad: (68 * Math.PI) / 180,
    peripheralRange: 14,
    sightRange: 76,
    hearingRange: 74,
    perceptionInterval: 0.12,
    accuracyScale: 0.72,
    fireIntervalScale: 1.25,
    headshotChance: 0.09,
    burstPauseChance: 0.22,
    focusFirePenalty: 0.74,
    turnSpeedRadPerSec: 5.8,
  },
  hard: {
    preferredMaxAttackers: 2,
    reactionTimeMin: 0.18,
    reactionTimeMax: 0.36,
    targetSwitchCooldown: 1.4,
    lostTargetMemoryDuration: 6.8,
    fovHalfAngleRad: (78 * Math.PI) / 180,
    peripheralRange: 18,
    sightRange: 88,
    hearingRange: 92,
    perceptionInterval: 0.09,
    accuracyScale: 0.92,
    fireIntervalScale: 1.0,
    headshotChance: 0.14,
    burstPauseChance: 0.12,
    focusFirePenalty: 0.54,
    turnSpeedRadPerSec: 7.4,
  },
};

export const PERSONALITY_PROFILES: Record<AIPersonality, AIPersonalityProfile> = {
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    aggressionBias: 1.26,
    investigateSoundChance: 0.84,
    fleeHealthThreshold: 24,
    abandonUncertaintyScale: 0.65,
    reactionScale: 0.88,
    switchCooldownScale: 1.15,
    preferredRangeScale: 0.84,
    woundedTargetBonus: 1.12,
    activeCombatantBonus: 1.15,
    searchPersistenceScale: 1.2,
    aimTurnScale: 1.12,
  },
  defensive: {
    id: 'defensive',
    label: 'Defensive',
    aggressionBias: 0.78,
    investigateSoundChance: 0.35,
    fleeHealthThreshold: 44,
    abandonUncertaintyScale: 1.35,
    reactionScale: 1.08,
    switchCooldownScale: 1.2,
    preferredRangeScale: 1.22,
    woundedTargetBonus: 1.0,
    activeCombatantBonus: 0.92,
    searchPersistenceScale: 0.82,
    aimTurnScale: 0.95,
  },
  opportunistic: {
    id: 'opportunistic',
    label: 'Opportunistic',
    aggressionBias: 0.96,
    investigateSoundChance: 0.74,
    fleeHealthThreshold: 34,
    abandonUncertaintyScale: 1.05,
    reactionScale: 0.96,
    switchCooldownScale: 0.72,
    preferredRangeScale: 1.0,
    woundedTargetBonus: 1.42,
    activeCombatantBonus: 1.38,
    searchPersistenceScale: 0.95,
    aimTurnScale: 1.04,
  },
  cautious: {
    id: 'cautious',
    label: 'Cautious',
    aggressionBias: 0.72,
    investigateSoundChance: 0.58,
    fleeHealthThreshold: 40,
    abandonUncertaintyScale: 1.45,
    reactionScale: 1.22,
    switchCooldownScale: 1.25,
    preferredRangeScale: 1.16,
    woundedTargetBonus: 1.1,
    activeCombatantBonus: 0.88,
    searchPersistenceScale: 0.78,
    aimTurnScale: 0.9,
  },
};

export const PERSONALITY_SEQUENCE: AIPersonality[] = [
  'aggressive',
  'opportunistic',
  'defensive',
  'cautious',
  'opportunistic',
  'aggressive',
  'cautious',
  'defensive',
  'aggressive',
  'opportunistic',
  'cautious',
];
