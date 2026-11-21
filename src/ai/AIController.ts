import { PhysicsWorld } from '../core/PhysicsWorld';
import { SafeZoneSystem } from '../systems/SafeZone';
import { ObstacleBounds } from '../world/Environment';
import { getTerrainHeight, ISLAND_PLAYABLE_RADIUS } from '../world/Terrain';
import { BotEntity } from './Bot';

export interface CombatantActor {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
}

export interface BotFireEvent {
  bot: BotEntity;
  target: CombatantActor;
  hit: boolean;
  isHeadshot: boolean;
  damage: number;
}

export class AIController {
  public bots: BotEntity[] = [];

  public update(
    dt: number,
    elapsedTotal: number,
    playerActor: CombatantActor,
    safeZone: SafeZoneSystem,
    physics: PhysicsWorld,
    obstacles: ObstacleBounds[],
    onBotFire: (ev: BotFireEvent) => void,
    onBotZoneEliminated: (bot: BotEntity) => void,
    heightAt: (x: number, z: number) => number = getTerrainHeight,
  ): void {
    const allActors: CombatantActor[] = [
      playerActor,
      ...this.bots.map((b) => ({
        id: b.id,
        name: b.name,
        x: b.x,
        y: b.y,
        z: b.z,
        alive: b.state !== 'Eliminated',
      })),
    ];

    for (const bot of this.bots) {
      if (bot.state === 'Eliminated') continue;

      // Safe zone periodic damage
      if (safeZone.isPointOutside(bot.x, bot.z)) {
        bot.health -= safeZone.damagePerSecond * dt;
        if (bot.health <= 0) {
          bot.health = 0;
          bot.state = 'Eliminated';
          bot.isMoving = false;
          onBotZoneEliminated(bot);
          continue;
        }
      }

      bot.stateTimer -= dt;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.healCooldown = Math.max(0, bot.healCooldown - dt);

      const distToZoneCenter = Math.hypot(
        bot.x - safeZone.currentCenterX,
        bot.z - safeZone.currentCenterZ,
      );
      const outsideOrEdge = distToZoneCenter > safeZone.currentRadius * 0.86;

      // Sense nearest visible opponent within 78m
      const nearestThreat = this.findVisibleThreat(bot, allActors, physics, 78);

      // Finite State Machine transitions
      if (bot.health < 36 && bot.state !== 'Evade') {
        bot.state = 'Evade';
        bot.stateTimer = 3.2;
        const fleeAngle = nearestThreat
          ? Math.atan2(bot.z - nearestThreat.z, bot.x - nearestThreat.x)
          : Math.atan2(safeZone.currentCenterZ - bot.z, safeZone.currentCenterX - bot.x);
        bot.targetX = bot.x + Math.cos(fleeAngle) * 28;
        bot.targetZ = bot.z + Math.sin(fleeAngle) * 28;
      } else if (outsideOrEdge && bot.state !== 'Alert') {
        bot.state = 'Explore';
        bot.targetX = safeZone.currentCenterX + (Math.random() - 0.5) * safeZone.currentRadius * 0.4;
        bot.targetZ = safeZone.currentCenterZ + (Math.random() - 0.5) * safeZone.currentRadius * 0.4;
        bot.stateTimer = 3.5;
      } else if (nearestThreat && bot.health >= 30) {
        bot.state = 'Alert';
        bot.targetEnemyId = nearestThreat.id;
      } else if (bot.state === 'Alert' && !nearestThreat) {
        bot.state = 'Search';
        bot.stateTimer = 3.0;
      } else if (bot.stateTimer <= 0) {
        if (bot.state === 'Idle') {
          bot.state = Math.random() < 0.35 ? 'Search' : 'Explore';
          this.pickWaypointInsideZone(bot, safeZone);
          bot.stateTimer = 4.0 + Math.random() * 4.0;
        } else if (bot.state === 'Evade') {
          if (bot.healCooldown <= 0) {
            bot.health = Math.min(bot.maxHealth, bot.health + 28);
            bot.healCooldown = 14;
          }
          bot.state = 'Explore';
          this.pickWaypointInsideZone(bot, safeZone);
          bot.stateTimer = 3.5;
        } else {
          bot.state = 'Idle';
          bot.stateTimer = 1.0 + Math.random() * 1.4;
        }
      }

      // Execute FSM state behavior
      let moveSpeed = 0;
      bot.isAiming = false;
      bot.isSprinting = false;
      if (bot.state === 'Idle') {
        bot.isMoving = false;
        bot.moveSpeed = 0;
        bot.yaw += Math.sin(elapsedTotal * 1.4 + bot.stridePhase) * 0.4 * dt;
      } else if (bot.state === 'Explore' || bot.state === 'Search') {
        moveSpeed = bot.state === 'Search' ? 4.8 : 5.4;
        bot.moveSpeed = moveSpeed;
        this.steerToward(bot, bot.targetX, bot.targetZ, moveSpeed, dt, obstacles, heightAt);
        if (Math.hypot(bot.targetX - bot.x, bot.targetZ - bot.z) < 2.2) {
          bot.state = 'Idle';
          bot.stateTimer = 1.1;
          bot.moveSpeed = 0;
        }
      } else if (bot.state === 'Evade') {
        moveSpeed = 7.4;
        bot.moveSpeed = moveSpeed;
        bot.isSprinting = true;
        this.steerToward(bot, bot.targetX, bot.targetZ, moveSpeed, dt, obstacles, heightAt);
      } else if (bot.state === 'Alert' && nearestThreat) {
        // Face target & strafe tactically
        const dx = nearestThreat.x - bot.x;
        const dz = nearestThreat.z - bot.z;
        const dist = Math.hypot(dx, dz);
        bot.yaw = Math.atan2(-dx, -dz);
        bot.isAiming = true;

        const strafeSign = Math.sin(elapsedTotal * 1.5 + bot.stridePhase) >= 0 ? 1 : -1;
        const desiredDist = bot.weapon.id === 'sg8' ? 14 : 26;
        const radialDir = dist > desiredDist + 4 ? 1 : dist < desiredDist - 4 ? -0.7 : 0;

        const dirX = (dx / Math.max(0.1, dist)) * radialDir + (-dz / Math.max(0.1, dist)) * strafeSign * 0.65;
        const dirZ = (dz / Math.max(0.1, dist)) * radialDir + (dx / Math.max(0.1, dist)) * strafeSign * 0.65;

        bot.moveSpeed = 4.4;
        this.steerToward(bot, bot.x + dirX * 8, bot.z + dirZ * 8, 4.4, dt, obstacles, heightAt);

        if (bot.fireCooldown <= 0 && dist <= bot.weapon.range) {
          const interval = Math.max(0.32, 1.15 / Math.min(3.5, bot.weapon.fireRate));
          bot.fireCooldown = interval + Math.random() * 0.25;
          bot.lastFiredAt = elapsedTotal;

          const accuracy = Math.max(0.22, 0.72 - dist / 110);
          const hit = Math.random() < accuracy;
          const isHeadshot = hit && Math.random() < 0.16;
          const dmg = hit ? Math.round(bot.weapon.damage * (isHeadshot ? 1.45 : 0.85)) : 0;

          onBotFire({
            bot,
            target: nearestThreat,
            hit,
            isHeadshot,
            damage: dmg,
          });
        }
      }
    }
  }

  private findVisibleThreat(
    bot: BotEntity,
    actors: CombatantActor[],
    physics: PhysicsWorld,
    maxRange: number,
  ): CombatantActor | null {
    let best: CombatantActor | null = null;
    let bestDist = maxRange;

    for (const actor of actors) {
      if (!actor.alive || actor.id === bot.id) continue;
      const dx = actor.x - bot.x;
      const dy = actor.y + 1.35 - (bot.y + 1.45);
      const dz = actor.z - bot.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= bestDist || dist < 0.5) continue;

      const inv = 1 / dist;
      const wallHit = physics.castWorldRay(
        bot.x,
        bot.y + 1.45,
        bot.z,
        dx * inv,
        dy * inv,
        dz * inv,
        dist - 0.4,
      );
      if (!wallHit) {
        bestDist = dist;
        best = actor;
      }
    }
    return best;
  }

  private pickWaypointInsideZone(bot: BotEntity, safeZone: SafeZoneSystem): void {
    const r = Math.random() * Math.min(safeZone.currentRadius * 0.8, 125);
    const a = Math.random() * Math.PI * 2;
    bot.targetX = safeZone.currentCenterX + Math.cos(a) * r;
    bot.targetZ = safeZone.currentCenterZ + Math.sin(a) * r;
  }

  private steerToward(
    bot: BotEntity,
    tx: number,
    tz: number,
    speed: number,
    dt: number,
    obstacles: ObstacleBounds[],
    heightAt: (x: number, z: number) => number,
  ): void {
    let dx = tx - bot.x;
    let dz = tz - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.1) {
      bot.isMoving = false;
      return;
    }
    dx /= dist;
    dz /= dist;

    // Obstacle repulsion steering
    for (const obs of obstacles) {
      const ox = bot.x - obs.x;
      const oz = bot.z - obs.z;
      const od = Math.hypot(ox, oz);
      const avoidDist = obs.radius + 1.9;
      if (od < avoidDist && od > 0.01) {
        const push = (avoidDist - od) / avoidDist;
        dx += (ox / od) * push * 2.2;
        dz += (oz / od) * push * 2.2;
      }
    }

    const norm = Math.hypot(dx, dz);
    if (norm > 0.01) {
      dx /= norm;
      dz /= norm;
    }

    const nextX = bot.x + dx * speed * dt;
    const nextZ = bot.z + dz * speed * dt;
    const r = Math.hypot(nextX, nextZ);
    if (r < ISLAND_PLAYABLE_RADIUS - 8) {
      bot.x = nextX;
      bot.z = nextZ;
    }
    bot.y = Math.max(0.2, heightAt(bot.x, bot.z));
    if (bot.state !== 'Alert') {
      bot.yaw = Math.atan2(-dx, -dz);
    }
    bot.isMoving = true;
    bot.stridePhase += dt * speed * 1.6;
  }

  public applyDamageToBot(
    bot: BotEntity,
    rawDamage: number,
  ): { damage: number; eliminated: boolean } {
    if (bot.state === 'Eliminated') return { damage: 0, eliminated: false };
    let dmg = rawDamage;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rawDamage * 0.35);
      bot.armor = Math.max(0, bot.armor - absorbed);
      dmg = Math.max(2, rawDamage - absorbed);
    }
    bot.health = Math.max(0, bot.health - dmg);
    bot.hitReactionToken += 1;
    let eliminated = false;
    if (bot.health <= 0) {
      bot.state = 'Eliminated';
      bot.isMoving = false;
      bot.moveSpeed = 0;
      bot.isSprinting = false;
      bot.isAiming = false;
      eliminated = true;
    }
    return { damage: dmg, eliminated };
  }
}
