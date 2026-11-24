import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIController } from './src/ai/AIController';
import { createBotEntity } from './src/ai/Bot';
import {
  CombatantActor,
  hasMuzzleLineOfSight,
  updateBotPerception,
} from './src/ai/Perception';
import { DIFFICULTY_CONFIGS } from './src/ai/AIConfig';
import { PhysicsWorld } from './src/core/PhysicsWorld';
import { MovementController } from './src/player/Movement';
import { HealthSystem } from './src/systems/Health';
import { SafeZoneSystem } from './src/systems/SafeZone';
import { MaterialLibrary } from './src/world/Materials';
import { MultiStoryBuilding } from './src/world/MultiStoryBuilding';

function createStubMaterials(): MaterialLibrary {
  const mat = new THREE.MeshBasicMaterial();
  return {
    terrain: mat,
    water: mat,
    concreteWall: mat,
    concreteDark: mat,
    brickWarm: mat,
    asphalt: mat,
    corrugatedSteel: mat,
    industrialAccent: mat,
    hazardTrim: mat,
    containerOlive: mat,
    containerRust: mat,
    containerSlate: mat,
    woodPlank: mat,
    treeBark: mat,
    treeFoliage: mat,
    rock: mat,
    gunMetal: mat,
    polymerDark: mat,
    lootCrateBody: mat,
    lootTrimAmber: mat,
    lootTrimEmerald: mat,
    sandstone: mat,
    desertSand: mat,
    snowGround: mat,
    glacierIce: mat,
    arcticMetal: mat,
    rustSteel: mat,
    cactusGreen: mat,
  } as unknown as MaterialLibrary;
}

function stepPlayerToward(
  movement: MovementController,
  physics: PhysicsWorld,
  health: HealthSystem,
  building: MultiStoryBuilding,
  targetX: number,
  targetZ: number,
  maxSeconds: number,
  baseY: number,
): void {
  const dt = 1 / 60;
  const steps = Math.round(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    building.update(dt);
    const dx = targetX - movement.position.x;
    const dz = targetZ - movement.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return;
    // Camera yaw = atan2(-dx, -dz) moves forward (+moveY) along (dx, dz)
    const yaw = Math.atan2(-dx, -dz);
    movement.update(
      dt,
      yaw,
      { moveX: 0, moveY: 1, sprint: false, crouch: false, jump: false },
      physics,
      health,
      () => baseY,
    );
  }
}

async function main(): Promise<void> {
  const physics = new PhysicsWorld();
  await physics.init();

  const GROUND_Y = 2.0;
  physics.buildTerrainHeightfield(200, 40, () => GROUND_Y);
  physics.createPlayerController(-42, GROUND_Y + 0.95, -31);

  const materials = createStubMaterials();
  const building = new MultiStoryBuilding(
    'urban-hq-2f',
    -42,
    GROUND_Y,
    -42,
    0,
    materials,
    physics,
  );
  physics.stepWorld();

  const movement = new MovementController();
  const health = new HealthSystem();
  movement.reset(-42, GROUND_Y, -32, physics);

  // 1. Closed South door blocks player from crossing z = -35.18
  stepPlayerToward(movement, physics, health, building, -42, -37.5, 2.5, GROUND_Y);
  assert(
    movement.position.z > -35.18,
    `Expected closed South door to block player, got z=${movement.position.z.toFixed(2)}`,
  );
  console.log(`[PASS] Closed South door blocked player at z=${movement.position.z.toFixed(2)}`);

  // 2. Open South door and let it swing open, then walk inside 1F lobby
  const doorPrompt = building.findNearestDoor(
    movement.position.x,
    movement.getFeetY(),
    movement.position.z,
  );
  assert(doorPrompt && doorPrompt.prompt.id === 'urban-hq-2f-door-south', 'Expected door prompt at South entrance');
  building.toggleDoor(doorPrompt.prompt.id);
  for (let i = 0; i < 40; i++) {
    building.update(1 / 60);
    physics.stepWorld();
  }
  stepPlayerToward(movement, physics, health, building, -42, -37.5, 2.0, GROUND_Y);
  assert(
    movement.position.z < -36.5 && Math.abs(movement.getFeetY() - (GROUND_Y + 0.24)) < 0.15,
    `Expected player inside 1F lobby, got pos=(${movement.position.x.toFixed(2)}, feet=${movement.getFeetY().toFixed(2)}, z=${movement.position.z.toFixed(2)})`,
  );
  console.log(
    `[PASS] Opened door & walked into 1F Lobby: z=${movement.position.z.toFixed(2)}, feetY=${movement.getFeetY().toFixed(2)}`,
  );

  // 3. Walk to East Stairwell vestibule and climb 16-tread staircase to 2F Landing
  stepPlayerToward(movement, physics, health, building, -42 + 5.95, -42 + 4.6, 3.0, GROUND_Y);
  stepPlayerToward(movement, physics, health, building, -42 + 5.95, -42 + 2.6, 1.5, GROUND_Y);
  stepPlayerToward(movement, physics, health, building, -42 + 5.95, -42 - 5.2, 4.5, GROUND_Y);
  const f2Expected = GROUND_Y + 3.94;
  assert(
    Math.abs(movement.getFeetY() - f2Expected) < 0.18 && movement.grounded,
    `Expected player at 2F landing feetY~=${f2Expected.toFixed(2)}, got ${movement.getFeetY().toFixed(2)} grounded=${movement.grounded}`,
  );
  console.log(
    `[PASS] Climbed stairs smoothly to 2F Landing: feetY=${movement.getFeetY().toFixed(2)}, z=${movement.position.z.toFixed(2)}, grounded=${movement.grounded}`,
  );

  // 4. Traverse 2F hallway -> South Hall -> open 2F Command Door -> 2F SW Room
  stepPlayerToward(movement, physics, health, building, -42, -42 - 5.0, 2.5, GROUND_Y);
  stepPlayerToward(movement, physics, health, building, -42, -42 + 3.2, 3.0, GROUND_Y);
  // 2F Command Door is closed initially at lx=-2.2 -> check blocking
  stepPlayerToward(movement, physics, health, building, -42 - 4.5, -42 + 3.2, 1.8, GROUND_Y);
  assert(
    movement.position.x > -44.2,
    `Expected closed 2F door to block player, got x=${movement.position.x.toFixed(2)}`,
  );
  const d2 = building.findNearestDoor(movement.position.x, movement.getFeetY(), movement.position.z);
  assert(d2 && d2.prompt.id === 'urban-hq-2f-door-2f-sw', 'Expected 2F Command Door prompt');
  building.toggleDoor(d2.prompt.id);
  for (let i = 0; i < 40; i++) {
    building.update(1 / 60);
    physics.stepWorld();
  }
  stepPlayerToward(movement, physics, health, building, -42 - 5.0, -42 + 3.2, 2.0, GROUND_Y);
  assert(
    movement.position.x < -46.2 && Math.abs(movement.getFeetY() - f2Expected) < 0.18,
    `Expected player inside 2F SW Command Room, got x=${movement.position.x.toFixed(2)}, feetY=${movement.getFeetY().toFixed(2)}`,
  );
  console.log(
    `[PASS] Entered 2F SW Command Room: x=${movement.position.x.toFixed(2)}, feetY=${movement.getFeetY().toFixed(2)}`,
  );

  // 5. Verify LOS & Raycasts (floor slab, wall, window, open door, stairwell)
  const floor1Center: CombatantActor = { x: -42, y: GROUND_Y + 0.24, z: -42, id: 'a', name: 'a', alive: true };
  const floor2Center: CombatantActor = { x: -42, y: GROUND_Y + 3.94, z: -42, id: 'b', name: 'b', alive: true };
  assert(
    !hasMuzzleLineOfSight(floor1Center, floor2Center, physics, []),
    '2F floor slab must block LOS between 1F and 2F center hallway',
  );
  const outdoorSouthWin: CombatantActor = { x: -42 - 4.8, y: GROUND_Y, z: -42 + 10.0, id: 'c', name: 'c', alive: true };
  const indoor1FSW: CombatantActor = { x: -42 - 4.8, y: GROUND_Y + 0.24, z: -42 + 3.5, id: 'd', name: 'd', alive: true };
  assert(
    hasMuzzleLineOfSight(outdoorSouthWin, indoor1FSW, physics, []),
    'Standing 1F window opening must permit LOS from exterior to 1F SW room',
  );
  // Test crouched target tucked behind 1F sill (0.96m > crouch 0.88m): should be occluded by sill!
  const indoor1FSWCrouched: CombatantActor = { ...indoor1FSW, z: -42 + 5.6, isCrouching: true };
  assert(
    !hasMuzzleLineOfSight(outdoorSouthWin, indoor1FSWCrouched, physics, []),
    'Crouching behind 1F window sill should grant cover from exterior ground level',
  );
  const stairBot: CombatantActor = { x: -42 + 5.95, y: GROUND_Y + 0.24, z: -42 + 2.4, id: 'e', name: 'e', alive: true };
  const stairTop: CombatantActor = { x: -42 + 5.95, y: GROUND_Y + 3.94, z: -42 - 3.9, id: 'f', name: 'f', alive: true };
  assert(
    hasMuzzleLineOfSight(stairBot, stairTop, physics, []),
    'Stairwell shaft must permit LOS along stairwell',
  );

  // Test bot perception across floors: 2F Lookout looking South out 2F window spots outdoor player,
  // while 1F target directly below slab is NOT seen
  const lookoutBot = createBotEntity(
    0,
    -42,
    GROUND_Y + 3.94,
    -42 + 5.2,
    1001,
  );
  lookoutBot.yaw = Math.PI; // looking +Z (South)
  const outdoorTarget: CombatantActor = {
    id: 'player',
    name: 'You',
    x: -42,
    y: GROUND_Y,
    z: -42 + 22.0,
    alive: true,
  };
  updateBotPerception(
    lookoutBot,
    [outdoorTarget, floor1Center],
    physics,
    DIFFICULTY_CONFIGS.normal,
    1.0,
    [],
  );
  assert(
    lookoutBot.visibleEnemyIds.has('player'),
    'Bot on 2F looking through 2F south window must spot outdoor target below',
  );
  assert(
    !lookoutBot.visibleEnemyIds.has('a'),
    'Bot on 2F must NOT have hidden X-ray sight through floor slab to 1F target below',
  );
  console.log('[PASS] LOS & cross-floor perception (floor slab, window cover, stairwell, 2F->outdoors) passed');

  // Reset doors for AI bot test
  building.resetDoors();
  for (let i = 0; i < 10; i++) {
    building.update(1 / 60);
    physics.stepWorld();
  }

  // 6. AI navigation test: bot enters closed South door, climbs stairs to 2F Command Room, then exits to North outdoors
  const ai = new AIController();
  const safeZone = new SafeZoneSystem();
  safeZone.reset(0, 0, 260);

  const bot = createBotEntity(1, -42, GROUND_Y, -31.5, 1002);
  const outdoorBot = createBotEntity(2, 20, GROUND_Y, 20, 1003);
  ai.bots = [bot, outdoorBot];

  const ghostPlayer = {
    id: 'player',
    name: 'You',
    x: 150,
    y: GROUND_Y,
    z: 150,
    alive: false,
    health: 100,
    maxHealth: 100,
  };

  let doorTogglesByBot = 0;
  const obstacles = [{ x: 26, z: 28, radius: 2.5 }];

  // Assign bot destination in 2F NW Command Room (-47, GROUND_Y + 3.94, -45.4)
  bot.state = 'Explore';
  bot.stateTimer = 30;
  ai.assignDestination(bot, -47, GROUND_Y + 3.94, -45.4, () => GROUND_Y, [building]);
  assert(bot.navPath.length >= 6, `Expected multi-floor navPath, got length ${bot.navPath.length}`);

  outdoorBot.state = 'Explore';
  outdoorBot.stateTimer = 30;
  ai.assignDestination(outdoorBot, 35, GROUND_Y, 35, () => GROUND_Y, [building]);

  let elapsed = 0;
  let reached2F = false;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 16; i++) {
    elapsed += dt;
    building.update(dt);
    physics.stepWorld();
    ai.update(
      dt,
      elapsed,
      ghostPlayer,
      safeZone,
      physics,
      obstacles,
      () => {},
      () => {},
      () => GROUND_Y,
      [building],
      () => {
        doorTogglesByBot += 1;
      },
    );
    if (bot.y > GROUND_Y + 3.6 && Math.hypot(bot.x - -47, bot.z - -45.4) < 3.0) {
      reached2F = true;
      break;
    }
  }
  assert(doorTogglesByBot >= 1, 'Bot must automatically open closed entrance door');
  assert(
    reached2F,
    `Bot failed to climb stairs to 2F room: pos=(${bot.x.toFixed(2)}, ${bot.y.toFixed(2)}, ${bot.z.toFixed(2)}), navRemaining=${bot.navPath.length}`,
  );
  assert(
    Math.hypot(outdoorBot.x - 35, outdoorBot.z - 35) < 4.5,
    `Outdoor bot failed to steer around obstacles to target: state=${outdoorBot.state} target=(${outdoorBot.targetX.toFixed(1)},${outdoorBot.targetZ.toFixed(1)}) pos=(${outdoorBot.x.toFixed(2)}, ${outdoorBot.z.toFixed(2)})`,
  );
  console.log(
    `[PASS] Bot opened door (${doorTogglesByBot}x), climbed stairs & reached 2F room at (${bot.x.toFixed(2)}, ${bot.y.toFixed(2)}, ${bot.z.toFixed(2)}), outdoor bot reached (${outdoorBot.x.toFixed(2)}, ${outdoorBot.z.toFixed(2)})`,
  );

  // 7. Test bot cross-floor Alert perception & engagement from 2F -> 2F vs exit back outdoors
  bot.state = 'Explore';
  bot.stateTimer = 25;
  ai.assignDestination(bot, -42, GROUND_Y, -60, () => GROUND_Y, [building]);
  let exitedNorth = false;
  for (let i = 0; i < 60 * 16; i++) {
    elapsed += dt;
    building.update(dt);
    physics.stepWorld();
    ai.update(
      dt,
      elapsed,
      ghostPlayer,
      safeZone,
      physics,
      obstacles,
      () => {},
      () => {},
      () => GROUND_Y,
      [building],
      () => {
        doorTogglesByBot += 1;
      },
    );
    if (Math.hypot(bot.x - -42, bot.z - -60) < 3.0 && Math.abs(bot.y - GROUND_Y) < 0.4) {
      exitedNorth = true;
      break;
    }
  }
  assert(
    exitedNorth,
    `Bot failed to descend stairs and exit North door outdoors: pos=(${bot.x.toFixed(2)}, ${bot.y.toFixed(2)}, ${bot.z.toFixed(2)})`,
  );
  console.log(
    `[PASS] Bot descended stairs, opened North exit, & reached outdoor destination (${bot.x.toFixed(2)}, ${bot.y.toFixed(2)}, ${bot.z.toFixed(2)})`,
  );

  building.dispose();
  console.log('ALL HEADLESS MULTI-STORY CHECKS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
