import { PhysicsWorld } from '../core/PhysicsWorld';
import { AICombatBalanceConfig } from './AIConfig';
import { BotEntity } from './Bot';

export interface CombatantActor {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  health?: number;
  maxHealth?: number;
  isCrouching?: boolean;
  isSprinting?: boolean;
  lastFiredAt?: number;
}

export interface SmokeVolume {
  x: number;
  y: number;
  z: number;
  radius: number;
  density?: number; // 0..1, >= 0.55 fully blocks LOS
}

export interface AISoundEvent {
  x: number;
  y: number;
  z: number;
  sourceId: string;
  radius: number;
  timestamp: number;
}

const EYE_HEIGHT = 1.48;
const TARGET_STAND_HEIGHT = 1.32;
const TARGET_CROUCH_HEIGHT = 0.88;

function segmentIntersectsSphere(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-6) return false;

  let t = ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = ax + abx * t - cx;
  const py = ay + aby * t - cy;
  const pz = az + abz * t - cz;
  return px * px + py * py + pz * pz <= radius * radius;
}

export function getBotForwardXZ(yaw: number): { fx: number; fz: number } {
  // Matches bot.yaw = Math.atan2(-dx, -dz)
  return {
    fx: -Math.sin(yaw),
    fz: -Math.cos(yaw),
  };
}

export function isTargetWithinDetectionCone(
  bot: BotEntity,
  actor: CombatantActor,
  config: AICombatBalanceConfig,
  elapsedTotal: number,
  alreadyTracked: boolean,
): boolean {
  const dx = actor.x - bot.x;
  const dz = actor.z - bot.z;
  const distSqXZ = dx * dx + dz * dz;
  if (distSqXZ < 0.25) return true;

  // Crouching targets are harder to spot at distance; sprinting/recently firing targets stand out slightly more
  let effectiveSightRange = config.sightRange;
  if (actor.isCrouching) {
    effectiveSightRange *= 0.76;
  } else if (actor.isSprinting) {
    effectiveSightRange *= 1.08;
  }
  if (actor.lastFiredAt !== undefined && elapsedTotal - actor.lastFiredAt < 1.8) {
    effectiveSightRange *= 1.12;
  }
  if (alreadyTracked) {
    effectiveSightRange *= 1.12;
  }

  if (distSqXZ > effectiveSightRange * effectiveSightRange) {
    return false;
  }

  const distXZ = Math.sqrt(distSqXZ);
  const invDist = 1 / distXZ;
  const { fx, fz } = getBotForwardXZ(bot.yaw);
  const dot = (dx * invDist) * fx + (dz * invDist) * fz;

  // Within close peripheral awareness, bots can sense nearby threats on flanks
  const peripheralRange = actor.isCrouching ? config.peripheralRange * 0.72 : config.peripheralRange;
  if (distXZ <= peripheralRange) {
    // ~135° half-angle peripheral awareness at close range
    return dot >= -0.7;
  }

  // If this bot was just shot by this actor recently, it turns toward the threat direction
  if (bot.lastDamageFromId === actor.id && elapsedTotal - bot.lastDamagedAt < 3.0) {
    return true;
  }

  // If already actively tracking this target, allow wider tracking FOV
  const halfAngle = alreadyTracked
    ? Math.min(Math.PI * 0.65, config.fovHalfAngleRad * 1.25)
    : config.fovHalfAngleRad;
  return dot >= Math.cos(halfAngle);
}

export function hasClearLineOfSight(
  bot: BotEntity,
  actor: CombatantActor,
  physics: PhysicsWorld,
  smokeVolumes: readonly SmokeVolume[] = [],
): boolean {
  const ox = bot.x;
  const oy = bot.y + EYE_HEIGHT;
  const oz = bot.z;

  const tx = actor.x;
  const ty = actor.y + (actor.isCrouching ? TARGET_CROUCH_HEIGHT : TARGET_STAND_HEIGHT);
  const tz = actor.z;

  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.35) return true;

  // Smoke occlusion check before expensive world raycast
  for (let i = 0; i < smokeVolumes.length; i++) {
    const s = smokeVolumes[i];
    if ((s.density ?? 1.0) < 0.5) continue;
    if (segmentIntersectsSphere(ox, oy, oz, tx, ty, tz, s.x, s.y, s.z, s.radius)) {
      return false;
    }
  }

  const inv = 1 / dist;
  const wallHit = physics.castWorldRay(
    ox,
    oy,
    oz,
    dx * inv,
    dy * inv,
    dz * inv,
    Math.max(0.1, dist - 0.38),
  );
  return !wallHit;
}

export function hasMuzzleLineOfSight(
  bot: BotEntity,
  actor: CombatantActor,
  physics: PhysicsWorld,
  smokeVolumes: readonly SmokeVolume[] = [],
): boolean {
  const ox = bot.x;
  const oy = bot.y + 1.34;
  const oz = bot.z;

  const tx = actor.x;
  const ty = actor.y + (actor.isCrouching ? 0.85 : 1.22);
  const tz = actor.z;

  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.35) return true;

  for (let i = 0; i < smokeVolumes.length; i++) {
    const s = smokeVolumes[i];
    if ((s.density ?? 1.0) < 0.5) continue;
    if (segmentIntersectsSphere(ox, oy, oz, tx, ty, tz, s.x, s.y, s.z, s.radius)) {
      return false;
    }
  }

  const inv = 1 / dist;
  const wallHit = physics.castWorldRay(
    ox,
    oy,
    oz,
    dx * inv,
    dy * inv,
    dz * inv,
    Math.max(0.1, dist - 0.38),
  );
  return !wallHit;
}

export function updateBotPerception(
  bot: BotEntity,
  actors: readonly CombatantActor[],
  physics: PhysicsWorld,
  config: AICombatBalanceConfig,
  elapsedTotal: number,
  smokeVolumes: readonly SmokeVolume[] = [],
): void {
  bot.visibleEnemyIds.clear();

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor.alive || actor.id === bot.id) continue;

    const alreadyTracked = bot.targetEnemyId === actor.id;
    if (!isTargetWithinDetectionCone(bot, actor, config, elapsedTotal, alreadyTracked)) {
      continue;
    }

    if (hasClearLineOfSight(bot, actor, physics, smokeVolumes)) {
      bot.visibleEnemyIds.add(actor.id);

      if (alreadyTracked) {
        bot.lastSeenTargetAt = elapsedTotal;
        bot.lostSightGraceTimer = 0;
        bot.lastKnownTargetPos.valid = true;
        bot.lastKnownTargetPos.x = actor.x;
        bot.lastKnownTargetPos.y = actor.y;
        bot.lastKnownTargetPos.z = actor.z;
        bot.lastKnownTargetPos.timestamp = elapsedTotal;
        bot.lastKnownTargetPos.sourceId = actor.id;
      }
    }
  }
}

export function registerSoundForBot(
  bot: BotEntity,
  event: AISoundEvent,
  config: AICombatBalanceConfig,
): void {
  if (bot.state === 'Eliminated' || event.sourceId === bot.id) return;

  const dx = event.x - bot.x;
  const dz = event.z - bot.z;
  const dist = Math.hypot(dx, dz);
  const maxHear = Math.min(config.hearingRange, event.radius);
  if (dist > maxHear || dist < 1.5) return;

  // Approximate investigation coordinate (uncertainty scales with distance; never exact telemetry)
  const jitterRadius = Math.min(12, 2.0 + dist * 0.11);
  const angle = Math.random() * Math.PI * 2;
  const mag = Math.random() * jitterRadius;

  bot.heardSoundPos.valid = true;
  bot.heardSoundPos.x = event.x + Math.cos(angle) * mag;
  bot.heardSoundPos.y = event.y;
  bot.heardSoundPos.z = event.z + Math.sin(angle) * mag;
  bot.heardSoundPos.timestamp = event.timestamp;
  bot.heardSoundPos.sourceId = event.sourceId;
}
