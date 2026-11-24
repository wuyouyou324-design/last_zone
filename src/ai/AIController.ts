import { PhysicsWorld } from '../core/PhysicsWorld';
import { SafeZoneSystem } from '../systems/SafeZone';
import { GameDifficulty } from '../types/game';
import { ObstacleBounds } from '../world/Environment';
import { getTerrainHeight, ISLAND_PLAYABLE_RADIUS } from '../world/Terrain';
import {
  AICombatBalanceConfig,
  DIFFICULTY_CONFIGS,
  PERSONALITY_PROFILES,
} from './AIConfig';
import { BotEntity } from './Bot';
import {
  doesSegmentCrossBuildingXZ,
  NavigableBuilding,
  pickExteriorCornerDetour,
  planBuildingRoute,
} from './BuildingNav';
import {
  AISoundEvent,
  CombatantActor,
  hasMuzzleLineOfSight,
  registerSoundForBot,
  SmokeVolume,
  updateBotPerception,
} from './Perception';
import { countActivePlayerAttackers, selectTargetForBot } from './TargetSelector';

export type { CombatantActor } from './Perception';

export interface BotFireEvent {
  bot: BotEntity;
  target: CombatantActor;
  hit: boolean;
  isHeadshot: boolean;
  damage: number;
}

export interface AICombatTelemetry {
  difficulty: GameDifficulty;
  activePlayerAttackers: number;
  aliveBots: number;
  states: Record<string, number>;
}

function normalizeAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class AIController {
  public bots: BotEntity[] = [];
  private difficulty: GameDifficulty = 'normal';
  private smokeVolumes: SmokeVolume[] = [];

  // Pre-allocated actor lookup structures to avoid per-frame GC allocations
  private actorPool: CombatantActor[] = [];
  private actorsById = new Map<string, CombatantActor>();

  public setDifficulty(difficulty: GameDifficulty): void {
    this.difficulty = difficulty;
  }

  public getDifficulty(): GameDifficulty {
    return this.difficulty;
  }

  public getConfig(): AICombatBalanceConfig {
    return DIFFICULTY_CONFIGS[this.difficulty];
  }

  public setSmokeVolumes(volumes: SmokeVolume[]): void {
    this.smokeVolumes = volumes;
  }

  public notifySoundEvent(
    x: number,
    y: number,
    z: number,
    sourceId: string,
    radius: number,
    timestamp: number,
  ): void {
    const config = this.getConfig();
    const event: AISoundEvent = { x, y, z, sourceId, radius, timestamp };
    for (let i = 0; i < this.bots.length; i++) {
      registerSoundForBot(this.bots[i], event, config);
    }
  }

  public getCombatTelemetry(): AICombatTelemetry {
    const states: Record<string, number> = {};
    let aliveBots = 0;
    let activePlayerAttackers = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      states[b.state] = (states[b.state] ?? 0) + 1;
      if (b.state !== 'Eliminated') {
        aliveBots += 1;
        if (b.currentlyEngagingPlayer) {
          activePlayerAttackers += 1;
        }
      }
    }
    return {
      difficulty: this.difficulty,
      activePlayerAttackers,
      aliveBots,
      states,
    };
  }

  private syncActorPool(playerActor: CombatantActor): void {
    const needed = 1 + this.bots.length;
    while (this.actorPool.length < needed) {
      this.actorPool.push({
        id: '',
        name: '',
        x: 0,
        y: 0,
        z: 0,
        alive: false,
      });
    }
    this.actorPool.length = needed;
    this.actorsById.clear();

    const pSlot = this.actorPool[0];
    pSlot.id = playerActor.id;
    pSlot.name = playerActor.name;
    pSlot.x = playerActor.x;
    pSlot.y = playerActor.y;
    pSlot.z = playerActor.z;
    pSlot.alive = playerActor.alive;
    pSlot.health = playerActor.health;
    pSlot.maxHealth = playerActor.maxHealth;
    pSlot.isCrouching = playerActor.isCrouching;
    pSlot.isSprinting = playerActor.isSprinting;
    pSlot.lastFiredAt = playerActor.lastFiredAt;
    this.actorsById.set(pSlot.id, pSlot);

    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      const slot = this.actorPool[i + 1];
      slot.id = b.id;
      slot.name = b.name;
      slot.x = b.x;
      slot.y = b.y;
      slot.z = b.z;
      slot.alive = b.state !== 'Eliminated';
      slot.health = b.health;
      slot.maxHealth = b.maxHealth;
      slot.isCrouching = false;
      slot.isSprinting = b.isSprinting;
      slot.lastFiredAt = b.lastFiredAt;
      this.actorsById.set(slot.id, slot);
    }
  }

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
    multiStoryBuildings: readonly NavigableBuilding[] = [],
    onDoorToggled?: (x: number, y: number, z: number, opening: boolean) => void,
  ): void {
    const config = this.getConfig();
    this.syncActorPool(playerActor);

    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (bot.state === 'Eliminated') {
        bot.currentlyEngagingPlayer = false;
        continue;
      }

      // Safe zone periodic damage
      if (safeZone.isPointOutside(bot.x, bot.z)) {
        bot.health -= safeZone.damagePerSecond * dt;
        if (bot.health <= 0) {
          bot.health = 0;
          bot.state = 'Eliminated';
          bot.isMoving = false;
          bot.moveSpeed = 0;
          bot.isSprinting = false;
          bot.isAiming = false;
          bot.currentlyEngagingPlayer = false;
          bot.targetEnemyId = null;
          onBotZoneEliminated(bot);
          continue;
        }
      }

      const profile = PERSONALITY_PROFILES[bot.personality];
      bot.stateTimer -= dt;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.healCooldown = Math.max(0, bot.healCooldown - dt);
      bot.perceptionTimer -= dt;
      bot.reactionTimer = Math.max(0, bot.reactionTimer - dt);
      bot.targetSwitchCooldown = Math.max(0, bot.targetSwitchCooldown - dt);
      bot.burstPauseTimer = Math.max(0, bot.burstPauseTimer - dt);
      bot.navRepathTimer = Math.max(0, bot.navRepathTimer - dt);

      const distToZoneCenter = Math.hypot(
        bot.x - safeZone.currentCenterX,
        bot.z - safeZone.currentCenterZ,
      );
      const outsideOrEdge = distToZoneCenter > safeZone.currentRadius * 0.86;

      // Staggered observable perception update (FOV + peripheral + LOS + smoke)
      let perceptionRan = false;
      if (bot.perceptionTimer <= 0) {
        bot.perceptionTimer = config.perceptionInterval + Math.random() * 0.03;
        updateBotPerception(
          bot,
          this.actorPool,
          physics,
          config,
          elapsedTotal,
          this.smokeVolumes,
        );
        perceptionRan = true;
      }

      // Validate current tracked target survival
      let currentTarget = bot.targetEnemyId ? this.actorsById.get(bot.targetEnemyId) ?? null : null;
      if (currentTarget && !currentTarget.alive) {
        bot.targetEnemyId = null;
        bot.lastKnownTargetPos.valid = false;
        bot.visibleEnemyIds.delete(currentTarget.id);
        currentTarget = null;
      }

      // Count how many OTHER bots are actively engaging the player
      const activePlayerAttackers = countActivePlayerAttackers(this.bots, bot.id);

      // Re-evaluate target selection when perception ticks or when current target disappeared
      if (perceptionRan || !currentTarget) {
        const selection = selectTargetForBot(
          bot,
          this.actorsById,
          activePlayerAttackers,
          config,
          elapsedTotal,
        );

        if (selection.selectedTarget) {
          if (selection.switchedTarget || bot.state !== 'Alert') {
            const targetChanged = bot.targetEnemyId !== selection.selectedTarget.id;
            bot.targetEnemyId = selection.selectedTarget.id;
            if (targetChanged || bot.state !== 'Alert') {
              const rawDelay =
                config.reactionTimeMin +
                Math.random() * (config.reactionTimeMax - config.reactionTimeMin);
              bot.reactionTimer = rawDelay * profile.reactionScale;
              bot.targetSwitchCooldown = config.targetSwitchCooldown * profile.switchCooldownScale;
              bot.burstShotsLeft = bot.weapon.automatic
                ? 3 + Math.floor(Math.random() * 3)
                : 1 + Math.floor(Math.random() * 2);
              bot.burstPauseTimer = 0;
              bot.navPath = [];
            }
          }
          bot.lastSeenTargetAt = elapsedTotal;
          bot.lostSightGraceTimer = 0;
          bot.lastKnownTargetPos.valid = true;
          bot.lastKnownTargetPos.x = selection.selectedTarget.x;
          bot.lastKnownTargetPos.y = selection.selectedTarget.y;
          bot.lastKnownTargetPos.z = selection.selectedTarget.z;
          bot.lastKnownTargetPos.timestamp = elapsedTotal;
          bot.lastKnownTargetPos.sourceId = selection.selectedTarget.id;
          currentTarget = selection.selectedTarget;
        }
      }

      const targetCurrentlyVisible =
        currentTarget !== null &&
        currentTarget.alive &&
        bot.visibleEnemyIds.has(currentTarget.id);

      // Finite State Machine transitions
      if (bot.health < profile.fleeHealthThreshold && bot.state !== 'Evade') {
        bot.state = 'Evade';
        bot.stateTimer = 3.2 + Math.random() * 0.8;
        bot.currentlyEngagingPlayer = false;
        const fleeAngle = currentTarget
          ? Math.atan2(bot.z - currentTarget.z, bot.x - currentTarget.x)
          : Math.atan2(safeZone.currentCenterZ - bot.z, safeZone.currentCenterX - bot.x);
        const fx = bot.x + Math.cos(fleeAngle) * 28;
        const fz = bot.z + Math.sin(fleeAngle) * 28;
        this.assignDestination(bot, fx, heightAt(fx, fz), fz, heightAt, multiStoryBuildings);
      } else if (outsideOrEdge && bot.state !== 'Alert') {
        const targetToSafeDist = Math.hypot(
          bot.targetX - safeZone.currentCenterX,
          bot.targetZ - safeZone.currentCenterZ,
        );
        if (
          bot.state !== 'Explore' ||
          targetToSafeDist > safeZone.currentRadius * 0.65 ||
          bot.stateTimer <= 0
        ) {
          bot.state = 'Explore';
          const sx =
            safeZone.currentCenterX + (Math.random() - 0.5) * safeZone.currentRadius * 0.4;
          const sz =
            safeZone.currentCenterZ + (Math.random() - 0.5) * safeZone.currentRadius * 0.4;
          this.assignDestination(bot, sx, heightAt(sx, sz), sz, heightAt, multiStoryBuildings);
          bot.stateTimer = 4.0;
        }
      } else if (
        targetCurrentlyVisible &&
        currentTarget &&
        bot.health >= profile.fleeHealthThreshold * 0.88 &&
        bot.state !== 'Evade'
      ) {
        if (bot.state !== 'Alert') {
          bot.navPath = [];
        }
        bot.state = 'Alert';
        bot.lostSightGraceTimer = 0;
      } else if (bot.state === 'Alert' && !targetCurrentlyVisible) {
        // Require sustained LOS loss (0.55s) before dropping from Alert to Search at last-known position
        bot.lostSightGraceTimer += dt;
        if (bot.lostSightGraceTimer >= 0.55) {
          bot.state = 'Search';
          if (bot.lastKnownTargetPos.valid) {
            this.assignDestination(
              bot,
              bot.lastKnownTargetPos.x,
              bot.lastKnownTargetPos.y,
              bot.lastKnownTargetPos.z,
              heightAt,
              multiStoryBuildings,
            );
          }
          bot.stateTimer =
            config.lostTargetMemoryDuration * profile.searchPersistenceScale;
          bot.lostSightGraceTimer = 0;
        }
      } else if (
        (bot.state === 'Idle' || bot.state === 'Explore') &&
        bot.heardSoundPos.valid &&
        elapsedTotal - bot.heardSoundPos.timestamp < 2.2
      ) {
        // Consume sound clue once and decide based on personality & pressure
        const soundX = bot.heardSoundPos.x;
        const soundY = bot.heardSoundPos.y;
        const soundZ = bot.heardSoundPos.z;
        const soundSourceId = bot.heardSoundPos.sourceId;
        bot.heardSoundPos.valid = false;

        const soundDist = Math.hypot(soundX - bot.x, soundY - bot.y, soundZ - bot.z);
        const playerCrowded =
          soundSourceId === 'player' &&
          activePlayerAttackers >= config.preferredMaxAttackers &&
          soundDist > 26;

        if (!playerCrowded && Math.random() < profile.investigateSoundChance) {
          bot.state = 'Search';
          this.assignDestination(bot, soundX, soundY, soundZ, heightAt, multiStoryBuildings);
          bot.stateTimer = 4.2 + Math.random() * 2.2;
        }
      } else if (bot.stateTimer <= 0) {
        if (bot.state === 'Idle') {
          bot.state = Math.random() < 0.3 ? 'Search' : 'Explore';
          this.pickWaypointInsideZone(bot, safeZone, heightAt, multiStoryBuildings);
          bot.stateTimer = 6.0 + Math.random() * 5.0;
        } else if (bot.state === 'Evade') {
          if (bot.healCooldown <= 0) {
            bot.health = Math.min(bot.maxHealth, bot.health + 28);
            bot.healCooldown = 14;
          }
          bot.state = 'Explore';
          bot.targetEnemyId = null;
          bot.lastKnownTargetPos.valid = false;
          this.pickWaypointInsideZone(bot, safeZone, heightAt, multiStoryBuildings);
          bot.stateTimer = 5.0;
        } else if (bot.state === 'Search') {
          // Search memory expired without reacquiring LOS -> forget target and return to Explore/Idle
          bot.targetEnemyId = null;
          bot.lastKnownTargetPos.valid = false;
          bot.navPath = [];
          bot.state = 'Idle';
          bot.stateTimer = 1.0 + Math.random() * 1.4;
        } else {
          bot.navPath = [];
          bot.state = 'Idle';
          bot.stateTimer = 1.0 + Math.random() * 1.4;
        }
      }

      // Defensive / cautious disengagement check if losing an uncertain long-range exchange
      if (
        bot.state === 'Alert' &&
        currentTarget &&
        (bot.personality === 'defensive' || bot.personality === 'cautious') &&
        bot.health < 56 &&
        elapsedTotal - bot.lastDamagedAt < 1.2 &&
        Math.hypot(currentTarget.x - bot.x, currentTarget.z - bot.z) > 32 &&
        Math.random() < 0.015 * profile.abandonUncertaintyScale
      ) {
        bot.state = 'Evade';
        bot.stateTimer = 2.6;
        const awayAngle = Math.atan2(bot.z - currentTarget.z, bot.x - currentTarget.x);
        const ex = bot.x + Math.cos(awayAngle) * 22;
        const ez = bot.z + Math.sin(awayAngle) * 22;
        this.assignDestination(bot, ex, heightAt(ex, ez), ez, heightAt, multiStoryBuildings);
      }

      // Track whether this bot is actively attacking the player (used by anti-focus-fire)
      bot.currentlyEngagingPlayer =
        bot.state === 'Alert' && bot.targetEnemyId === 'player';

      // Execute FSM state behavior
      let moveSpeed = 0;
      bot.isAiming = false;
      bot.isSprinting = false;

      if (bot.state === 'Idle') {
        bot.isMoving = false;
        bot.moveSpeed = 0;
        bot.stuckTimer = 0;
        bot.yaw += Math.sin(elapsedTotal * 1.4 + bot.stridePhase) * 0.42 * dt;
      } else if (bot.state === 'Explore' || bot.state === 'Search') {
        moveSpeed = bot.state === 'Search' ? 4.8 : 5.3;
        bot.moveSpeed = moveSpeed;
        this.followNavigationOrSteer(
          bot,
          moveSpeed,
          dt,
          obstacles,
          heightAt,
          multiStoryBuildings,
          onDoorToggled,
        );
        const reached =
          bot.navPath.length === 0 &&
          Math.hypot(bot.targetX - bot.x, bot.targetZ - bot.z) < 2.1 &&
          Math.abs(bot.targetY - bot.y) < 1.9;
        if (reached) {
          if (bot.state === 'Search') {
            bot.targetEnemyId = null;
            bot.lastKnownTargetPos.valid = false;
          }
          bot.state = 'Idle';
          bot.stateTimer = 1.1 + Math.random() * 0.9;
          bot.moveSpeed = 0;
        }
      } else if (bot.state === 'Evade') {
        moveSpeed = 7.4;
        bot.moveSpeed = moveSpeed;
        bot.isSprinting = true;
        this.followNavigationOrSteer(
          bot,
          moveSpeed,
          dt,
          obstacles,
          heightAt,
          multiStoryBuildings,
          onDoorToggled,
        );
      } else if (bot.state === 'Alert' && currentTarget) {
        const dx = currentTarget.x - bot.x;
        const dy = currentTarget.y - bot.y;
        const dz = currentTarget.z - bot.z;
        const dist = Math.hypot(dx, dz);
        const dist3D = Math.hypot(dx, dy, dz);

        // Smooth human-like aim rotation instead of instant 1-frame snap
        const desiredYaw = Math.atan2(-dx, -dz);
        const angleDiff = normalizeAngleRad(desiredYaw - bot.yaw);
        const maxTurn = config.turnSpeedRadPerSec * profile.aimTurnScale * dt;
        if (Math.abs(angleDiff) <= maxTurn) {
          bot.yaw = desiredYaw;
        } else {
          bot.yaw = normalizeAngleRad(bot.yaw + Math.sign(angleDiff) * maxTurn);
        }

        bot.isAiming = bot.reactionTimer <= 0.12;

        // If target is on a different floor inside/near a building, route toward their floor via stairs
        const inBuilding = this.findBuildingAt(bot.x, bot.z, 0.8, multiStoryBuildings);
        const targetBuilding = this.findBuildingAt(
          currentTarget.x,
          currentTarget.z,
          0.8,
          multiStoryBuildings,
        );
        if (
          (inBuilding || targetBuilding) &&
          Math.abs(dy) > 2.1 &&
          dist3D > 3.5
        ) {
          if (bot.navPath.length === 0 && bot.navRepathTimer <= 0) {
            bot.navRepathTimer = 0.9;
            this.assignDestination(
              bot,
              currentTarget.x,
              currentTarget.y,
              currentTarget.z,
              heightAt,
              multiStoryBuildings,
            );
          }
          bot.moveSpeed = 4.6;
          this.followNavigationOrSteer(
            bot,
            4.6,
            dt,
            obstacles,
            heightAt,
            multiStoryBuildings,
            onDoorToggled,
            true,
          );
        } else {
          bot.navPath = [];
          const strafeSign = Math.sin(elapsedTotal * 1.5 + bot.stridePhase) >= 0 ? 1 : -1;
          const baseDesiredDist =
            bot.weapon.id === 'sg8' ? 14 : bot.weapon.id === 'mr12' ? 36 : 26;
          const desiredDist = baseDesiredDist * profile.preferredRangeScale;
          const radialDir = dist > desiredDist + 4 ? 1 : dist < desiredDist - 4 ? -0.7 : 0;

          const invDist = 1 / Math.max(0.1, dist);
          const dirX = dx * invDist * radialDir + -dz * invDist * strafeSign * 0.65;
          const dirZ = dz * invDist * radialDir + dx * invDist * strafeSign * 0.65;

          bot.moveSpeed = 4.3;
          this.steerToward(
            bot,
            bot.x + dirX * 8,
            bot.z + dirZ * 8,
            4.3,
            dt,
            obstacles,
            heightAt,
            multiStoryBuildings,
            onDoorToggled,
          );
        }

        // Fire only after reaction delay, with clear muzzle LOS, yaw alignment, and natural bursts
        if (
          bot.reactionTimer <= 0 &&
          bot.burstPauseTimer <= 0 &&
          bot.fireCooldown <= 0 &&
          dist3D <= bot.weapon.range &&
          Math.abs(angleDiff) < 0.34
        ) {
          const muzzleClear = hasMuzzleLineOfSight(
            bot,
            currentTarget,
            physics,
            this.smokeVolumes,
          );

          if (!muzzleClear) {
            bot.fireCooldown = 0.2;
          } else {
            const baseInterval = Math.max(0.32, 1.15 / Math.min(3.5, bot.weapon.fireRate));
            bot.fireCooldown =
              baseInterval * config.fireIntervalScale + Math.random() * 0.24;
            bot.lastFiredAt = elapsedTotal;

            bot.burstShotsLeft -= 1;
            if (bot.burstShotsLeft <= 0) {
              bot.burstShotsLeft = bot.weapon.automatic
                ? 2 + Math.floor(Math.random() * 4)
                : 1 + Math.floor(Math.random() * 2);
              if (Math.random() < 1 - config.burstPauseChance * 0.35) {
                bot.burstPauseTimer = 0.38 + Math.random() * 0.55;
              }
            }

            let hitProb = Math.max(0.14, (0.68 - dist3D / 108) * config.accuracyScale);
            if (currentTarget.isCrouching) hitProb *= 0.8;
            if (currentTarget.isSprinting) hitProb *= 0.84;
            if (bot.weapon.id === 'sg8' && dist3D > 28) hitProb *= 0.6;

            const hit = Math.random() < hitProb;
            const isHeadshot = hit && Math.random() < config.headshotChance;
            const dmg = hit
              ? Math.round(bot.weapon.damage * (isHeadshot ? 1.4 : 0.82))
              : 0;

            onBotFire({
              bot,
              target: currentTarget,
              hit,
              isHeadshot,
              damage: dmg,
            });
          }
        }
      }

      // Stuck recovery monitor (prevents wedging in doorways or corners)
      if (bot.isMoving) {
        bot.stuckTimer += dt;
        if (bot.stuckTimer >= 1.15) {
          const moved = Math.hypot(
            bot.x - bot.stuckAnchorX,
            bot.y - bot.stuckAnchorY,
            bot.z - bot.stuckAnchorZ,
          );
          if (moved < 0.52) {
            let openedDoor = false;
            for (let bIdx = 0; bIdx < multiStoryBuildings.length; bIdx++) {
              const b = multiStoryBuildings[bIdx];
              const blockedDoor = b.findBlockingDoorNear(bot.x, bot.y, bot.z, 2.5);
              if (blockedDoor) {
                if (b.setDoorOpen(blockedDoor.id, true)) {
                  onDoorToggled?.(blockedDoor.x, blockedDoor.y, blockedDoor.z, true);
                }
                openedDoor = true;
                break;
              }
            }
            if (!openedDoor) {
              if (bot.navPath.length > 1) {
                bot.navPath.shift();
              } else if (bot.state === 'Explore' || bot.state === 'Search') {
                bot.navPath = [];
                bot.state = 'Idle';
                bot.stateTimer = 0.45;
              }
            }
          }
          bot.stuckTimer = 0;
          bot.stuckAnchorX = bot.x;
          bot.stuckAnchorY = bot.y;
          bot.stuckAnchorZ = bot.z;
        }
      } else {
        bot.stuckTimer = 0;
        bot.stuckAnchorX = bot.x;
        bot.stuckAnchorY = bot.y;
        bot.stuckAnchorZ = bot.z;
      }
    }
  }

  private findBuildingAt(
    x: number,
    z: number,
    margin: number,
    buildings: readonly NavigableBuilding[],
  ): NavigableBuilding | null {
    for (let i = 0; i < buildings.length; i++) {
      if (buildings[i].containsXZ(x, z, margin)) {
        return buildings[i];
      }
    }
    return null;
  }

  public assignDestination(
    bot: BotEntity,
    tx: number,
    ty: number,
    tz: number,
    heightAt: (x: number, z: number) => number,
    buildings: readonly NavigableBuilding[],
  ): void {
    bot.targetX = tx;
    bot.targetY = ty;
    bot.targetZ = tz;
    bot.navPath = [];

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const botInside = b.containsXZ(bot.x, bot.z, 0.55);
      const goalInside = b.containsXZ(tx, tz, 0.45);

      if (botInside || goalInside) {
        const route = planBuildingRoute(b, bot.x, bot.y, bot.z, tx, ty, tz);
        if (route.length > 0) {
          if (!botInside && doesSegmentCrossBuildingXZ(bot.x, bot.z, route[0].x, route[0].z, b, 0.35)) {
            const entryDetour = pickExteriorCornerDetour(b, bot.x, bot.z, route[0].x, route[0].z);
            if (entryDetour) {
              route.unshift({
                buildingId: b.id,
                nodeId: 'ext-entry-detour',
                x: entryDetour.x,
                y: heightAt(entryDetour.x, entryDetour.z),
                z: entryDetour.z,
                floor: 0,
                kind: 'outdoor',
              });
            }
          }
          const lastWp = route[route.length - 1];
          if (!goalInside && doesSegmentCrossBuildingXZ(lastWp.x, lastWp.z, tx, tz, b, 0.45)) {
            const exitDetour = pickExteriorCornerDetour(b, lastWp.x, lastWp.z, tx, tz);
            if (exitDetour) {
              route.push({
                buildingId: b.id,
                nodeId: 'ext-exit-detour',
                x: exitDetour.x,
                y: heightAt(exitDetour.x, exitDetour.z),
                z: exitDetour.z,
                floor: 0,
                kind: 'outdoor',
              });
            }
          }
          bot.navPath = route;
        }
        return;
      }

      if (doesSegmentCrossBuildingXZ(bot.x, bot.z, tx, tz, b, 0.95)) {
        const detour = pickExteriorCornerDetour(b, bot.x, bot.z, tx, tz);
        if (detour) {
          bot.navPath = [
            {
              buildingId: b.id,
              nodeId: 'ext-detour',
              x: detour.x,
              y: heightAt(detour.x, detour.z),
              z: detour.z,
              floor: 0,
              kind: 'outdoor',
            },
          ];
        }
        return;
      }
    }
  }

  private pickWaypointInsideZone(
    bot: BotEntity,
    safeZone: SafeZoneSystem,
    heightAt: (x: number, z: number) => number,
    buildings: readonly NavigableBuilding[],
  ): void {
    // Allow bots to naturally enter and explore multi-story buildings within the safe zone
    if (buildings.length > 0) {
      const b = buildings[Math.floor(Math.random() * buildings.length)];
      const buildingSafe =
        Math.hypot(b.originX - safeZone.currentCenterX, b.originZ - safeZone.currentCenterZ) <
        safeZone.currentRadius * 0.85;

      if (buildingSafe) {
        const botInside = b.containsXZ(bot.x, bot.z, 0.8);
        const distToBuilding = Math.hypot(b.originX - bot.x, b.originZ - bot.z);
        const enterChance = botInside ? 0.52 : distToBuilding < 55 ? 0.42 : 0.2;

        if (Math.random() < enterChance) {
          const spots = b.getExploreWaypoints();
          if (spots.length > 0) {
            const pick = spots[Math.floor(Math.random() * spots.length)];
            this.assignDestination(bot, pick.x, pick.y, pick.z, heightAt, buildings);
            return;
          }
        }
      }
    }

    const r = Math.random() * Math.min(safeZone.currentRadius * 0.8, 125);
    const a = Math.random() * Math.PI * 2;
    const tx = safeZone.currentCenterX + Math.cos(a) * r;
    const tz = safeZone.currentCenterZ + Math.sin(a) * r;
    this.assignDestination(bot, tx, heightAt(tx, tz), tz, heightAt, buildings);
  }

  private followNavigationOrSteer(
    bot: BotEntity,
    speed: number,
    dt: number,
    obstacles: ObstacleBounds[],
    heightAt: (x: number, z: number) => number,
    buildings: readonly NavigableBuilding[],
    onDoorToggled?: (x: number, y: number, z: number, opening: boolean) => void,
    preserveAimYaw = false,
  ): void {
    if (bot.navPath.length > 0) {
      const wp = bot.navPath[0];

      // Auto-open closed doors when approaching a door portal
      if (wp.doorId) {
        const dDoor = Math.hypot(wp.x - bot.x, wp.z - bot.z);
        if (dDoor < 2.4 && Math.abs(wp.y - bot.y) < 1.9) {
          for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            if (b.id === wp.buildingId) {
              const door = b.getDoorById(wp.doorId);
              if (door && !door.isOpen) {
                if (b.setDoorOpen(wp.doorId, true)) {
                  onDoorToggled?.(door.x, door.y, door.z, true);
                }
              }
              break;
            }
          }
        }
      }

      this.steerToward(
        bot,
        wp.x,
        wp.z,
        speed,
        dt,
        obstacles,
        heightAt,
        buildings,
        onDoorToggled,
        preserveAimYaw,
      );

      const arriveDist = wp.kind === 'stair' ? 0.9 : 1.05;
      if (
        Math.hypot(wp.x - bot.x, wp.z - bot.z) < arriveDist &&
        Math.abs(wp.y - bot.y) < 1.7
      ) {
        bot.navPath.shift();
      }
      return;
    }

    this.steerToward(
      bot,
      bot.targetX,
      bot.targetZ,
      speed,
      dt,
      obstacles,
      heightAt,
      buildings,
      onDoorToggled,
      preserveAimYaw,
    );
  }

  private steerToward(
    bot: BotEntity,
    tx: number,
    tz: number,
    speed: number,
    dt: number,
    obstacles: ObstacleBounds[],
    heightAt: (x: number, z: number) => number,
    buildings: readonly NavigableBuilding[],
    onDoorToggled?: (x: number, y: number, z: number, opening: boolean) => void,
    preserveAimYaw = false,
  ): void {
    let dx = tx - bot.x;
    let dz = tz - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.08) {
      bot.isMoving = false;
      return;
    }
    dx /= dist;
    dz /= dist;

    const insideBuilding = this.findBuildingAt(bot.x, bot.z, 1.35, buildings);

    // Outdoor obstacle repulsion steering (disabled while navigating inside a building)
    if (!insideBuilding) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
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
    }

    const norm = Math.hypot(dx, dz);
    if (norm > 0.01) {
      dx /= norm;
      dz /= norm;
    }

    let nextX = bot.x + dx * speed * dt;
    let nextZ = bot.z + dz * speed * dt;

    // Building interior wall & closed-door sliding collision + floor/stair elevation
    const activeBuilding =
      insideBuilding ?? this.findBuildingAt(nextX, nextZ, 0.9, buildings);
    if (activeBuilding) {
      const col = activeBuilding.resolveBotCollision(nextX, bot.y, nextZ, 0.42);
      nextX = col.x;
      nextZ = col.z;
      if (col.blockedDoorId) {
        const door = activeBuilding.getDoorById(col.blockedDoorId);
        if (door && !door.isOpen && activeBuilding.setDoorOpen(col.blockedDoorId, true)) {
          onDoorToggled?.(door.x, door.y, door.z, true);
        }
      }
    }

    const r = Math.hypot(nextX, nextZ);
    if (r < ISLAND_PLAYABLE_RADIUS - 8) {
      bot.x = nextX;
      bot.z = nextZ;
    }

    let resolvedY: number | null = null;
    if (activeBuilding) {
      resolvedY = activeBuilding.getWalkableHeight(bot.x, bot.y, bot.z);
    }
    bot.y = resolvedY !== null ? resolvedY : Math.max(0.2, heightAt(bot.x, bot.z));

    if (bot.state !== 'Alert' && !preserveAimYaw) {
      const moveYaw = Math.atan2(-dx, -dz);
      const yawDiff = normalizeAngleRad(moveYaw - bot.yaw);
      const turnStep = Math.min(Math.abs(yawDiff), 8.5 * dt);
      bot.yaw = normalizeAngleRad(bot.yaw + Math.sign(yawDiff) * turnStep);
    }
    bot.isMoving = true;
    bot.stridePhase += dt * speed * 1.6;
  }

  public applyDamageToBot(
    bot: BotEntity,
    rawDamage: number,
    attackerId?: string,
    elapsedTotal?: number,
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

    if (attackerId) {
      bot.lastDamageFromId = attackerId;
      bot.lastDamagedAt = elapsedTotal ?? bot.lastDamagedAt;
      // Trigger immediate perception check on next tick so an attacked bot can react to direct threat
      bot.perceptionTimer = 0;
    }

    let eliminated = false;
    if (bot.health <= 0) {
      bot.state = 'Eliminated';
      bot.isMoving = false;
      bot.moveSpeed = 0;
      bot.isSprinting = false;
      bot.isAiming = false;
      bot.currentlyEngagingPlayer = false;
      bot.targetEnemyId = null;
      bot.navPath = [];
      eliminated = true;
    }
    return { damage: dmg, eliminated };
  }
}
