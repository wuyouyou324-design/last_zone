import { AICombatBalanceConfig, PERSONALITY_PROFILES } from './AIConfig';
import { BotEntity } from './Bot';
import { CombatantActor } from './Perception';

export interface TargetSelectionResult {
  selectedTarget: CombatantActor | null;
  switchedTarget: boolean;
}

export function countActivePlayerAttackers(
  bots: readonly BotEntity[],
  excludeBotId?: string,
): number {
  let count = 0;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (b.state === 'Eliminated' || b.id === excludeBotId) continue;
    if (b.currentlyEngagingPlayer) {
      count += 1;
    }
  }
  return count;
}

export function selectTargetForBot(
  bot: BotEntity,
  actorsById: ReadonlyMap<string, CombatantActor>,
  activePlayerAttackers: number,
  config: AICombatBalanceConfig,
  elapsedTotal: number,
): TargetSelectionResult {
  const profile = PERSONALITY_PROFILES[bot.personality];
  const currentTarget = bot.targetEnemyId ? actorsById.get(bot.targetEnemyId) ?? null : null;
  const currentValidAndVisible =
    currentTarget !== null &&
    currentTarget.alive &&
    bot.visibleEnemyIds.has(currentTarget.id);

  // Respect target switch cooldown while current visible target remains valid,
  // unless an unengaged close attacker directly shoots this bot.
  if (currentValidAndVisible && bot.targetSwitchCooldown > 0) {
    const newDirectAttacker =
      bot.lastDamageFromId &&
      bot.lastDamageFromId !== bot.targetEnemyId &&
      elapsedTotal - bot.lastDamagedAt < 1.5
        ? actorsById.get(bot.lastDamageFromId) ?? null
        : null;

    if (
      !newDirectAttacker ||
      !newDirectAttacker.alive ||
      !bot.visibleEnemyIds.has(newDirectAttacker.id)
    ) {
      return { selectedTarget: currentTarget, switchedTarget: false };
    }
  }

  let bestActor: CombatantActor | null = null;
  let bestScore = -Infinity;

  for (const actorId of bot.visibleEnemyIds) {
    const actor = actorsById.get(actorId);
    if (!actor || !actor.alive || actor.id === bot.id) continue;

    const dx = actor.x - bot.x;
    const dz = actor.z - bot.z;
    const dist = Math.hypot(dx, dz);

    // Base distance score (closer = higher, normalized 0..1.25)
    const maxRange = Math.max(config.sightRange, bot.weapon.range * 0.75);
    let score = Math.max(0.08, 1.25 - dist / maxRange);

    // Weapon range fit bonus (shotguns favor close range, marksman favors mid-long)
    const idealDist = (bot.weapon.id === 'sg8' ? 16 : bot.weapon.id === 'mr12' ? 46 : 28) * profile.preferredRangeScale;
    const rangeFit = 1 - Math.min(0.45, Math.abs(dist - idealDist) / 90);
    score *= rangeFit;

    // Personality bias (zero player favoritism)
    score *= profile.aggressionBias;

    // Direct threat override: anyone who recently damaged this bot becomes top concern
    const recentlyShotByThis =
      bot.lastDamageFromId === actor.id && elapsedTotal - bot.lastDamagedAt < 5.0;
    if (recentlyShotByThis) {
      score *= 1.65;
    }

    // Opportunistic & general combat cues: wounded or actively fighting opponents
    const healthRatio =
      actor.health !== undefined && actor.maxHealth && actor.maxHealth > 0
        ? actor.health / actor.maxHealth
        : 1.0;
    if (healthRatio < 0.7) {
      score *= profile.woundedTargetBonus;
    }
    if (actor.lastFiredAt !== undefined && elapsedTotal - actor.lastFiredAt < 2.2) {
      score *= profile.activeCombatantBonus;
    }

    // Target hysteresis: prefer sticking with the current visible target
    if (actor.id === bot.targetEnemyId) {
      score *= 1.28;
    }

    // Anti-focus-fire soft pressure cap for player targets
    if (actor.id === 'player' && bot.targetEnemyId !== 'player') {
      const directDanger = recentlyShotByThis || dist < 13.5;
      if (activePlayerAttackers >= config.preferredMaxAttackers) {
        if (!directDanger) {
          score *= Math.max(0.08, 1 - config.focusFirePenalty);
        } else {
          // Even when directly threatened, keep a mild damping factor beyond cap
          score *= 0.78;
        }
      } else if (activePlayerAttackers > 0 && !directDanger) {
        // Mildly prefer uncontested AI targets if multiple choices are visible
        score *= 0.85;
      }
    }

    // Defensive / cautious bots avoid initiating low-value long-range fights
    // when they aren't directly threatened and pressure is already present
    const minEngageThreshold =
      bot.personality === 'cautious'
        ? 0.42
        : bot.personality === 'defensive'
          ? 0.36
          : 0.22;

    if (score < minEngageThreshold && !recentlyShotByThis && dist > 18) {
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      bestActor = actor;
    }
  }

  if (!bestActor) {
    return { selectedTarget: null, switchedTarget: bot.targetEnemyId !== null };
  }

  return {
    selectedTarget: bestActor,
    switchedTarget: bestActor.id !== bot.targetEnemyId,
  };
}
