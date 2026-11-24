import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AIController, BotFireEvent } from '../ai/AIController';
import { BotEntity, createBotEntity } from '../ai/Bot';
import {
  CharacterAppearanceLibrary,
  createBotAppearancePreset,
} from '../character/CharacterAppearance';
import { CharacterInstance } from '../character/CharacterInstance';
import { CharacterLODController } from '../character/CharacterLOD';
import { CharacterAssetBundle, CharacterLoader } from '../character/CharacterLoader';
import { InputManager } from '../input/InputManager';
import { TouchInput } from '../input/TouchInput';
import { CameraController } from '../player/Camera';
import { MovementController } from '../player/Movement';
import { PlayerAvatar } from '../player/Player';
import { CombatSystem, CombatTarget } from '../systems/Combat';
import { HealthSystem } from '../systems/Health';
import { InventorySystem } from '../systems/Inventory';
import { SafeZoneSystem } from '../systems/SafeZone';
import {
  GameScreen,
  GameSettings,
  HudSnapshot,
  KillFeedEntry,
  MapId,
  MatchSummary,
  MinimapBlip,
} from '../types/game';
import { MAP_CATALOG } from '../world/MapCatalog';
import { MaterialLibrary } from '../world/Materials';
import { IslandMap } from '../world/Map';
import { WeaponModelId, WeaponModelsFactory } from '../weapons/WeaponModels';
import { VehicleInstance, VehicleManager } from '../vehicles/VehicleManager';
import { AudioSystem } from './AudioSystem';
import { detectSoftwareWebGL, GameLoop } from './GameLoop';
import { PhysicsWorld } from './PhysicsWorld';

interface BotVisualRig {
  character: CharacterInstance;
  lastHitToken: number;
  eliminationTriggered: boolean;
}

const TOTAL_COMBATANTS = 12;
const _camOrigin = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _botOrigin = new THREE.Vector3();
const _botDir = new THREE.Vector3();
const _botMuzzle = new THREE.Vector3();

export class Game {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly cameraCtrl: CameraController;
  public readonly audio = new AudioSystem();
  public readonly input: InputManager;
  private physics = new PhysicsWorld();
  private materials!: MaterialLibrary;
  private weaponFactory!: WeaponModelsFactory;
  private characterLoader = new CharacterLoader();
  private characterBundle!: CharacterAssetBundle;
  private characterAppearance!: CharacterAppearanceLibrary;
  private map!: IslandMap;
  private avatar!: PlayerAvatar;
  private movement = new MovementController();
  private inventory!: InventorySystem;
  private health = new HealthSystem();
  private safeZone!: SafeZoneSystem;
  private combat!: CombatSystem;
  private vehicles = new VehicleManager();
  private ai = new AIController();
  private loop!: GameLoop;

  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private activeMapId: MapId = 'emerald_island';
  private botRigs = new Map<string, BotVisualRig>();
  private envRT: THREE.WebGLRenderTarget | null = null;

  private screen: GameScreen = 'menu';
  private settings: GameSettings;
  private onHudUpdate: (snap: HudSnapshot) => void;
  private onMatchEnd: (summary: MatchSummary) => void;
  private onContextIssue: (lost: boolean) => void;

  private isFiring = false;
  private prevFireHeld = false;
  private isAiming = false;
  private fireCooldown = 0;
  private reloadTimer: { elapsed: number; total: number; weaponName: string } | null = null;
  private kills = 0;
  private damageDealt = 0;
  private matchTimeSec = 0;
  private eliminatedBy: string | null = null;
  private hitMarkerAlpha = 0;
  private hitMarkerKill = false;
  private damageFlashAlpha = 0;
  private killFeed: KillFeedEntry[] = [];
  private gunfireBlips: Array<{ x: number; z: number; timeLeft: number }> = [];
  private hudEmitAccum = 0;
  private disposed = false;
  private ready = false;
  private menuOrbitAngle = 0.4;
  private currentElapsed = 0;
  private lastPlayerFireTime = -10;
  private ramCooldownByBot = new Map<string, number>();

  constructor(
    private container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: {
      onHudUpdate: (snap: HudSnapshot) => void;
      onMatchEnd: (summary: MatchSummary) => void;
      onContextIssue: (lost: boolean) => void;
      onReady: () => void;
      onInitError?: (message: string) => void;
    },
  ) {
    this.settings = { ...initialSettings };
    this.onHudUpdate = callbacks.onHudUpdate;
    this.onMatchEnd = callbacks.onMatchEnd;
    this.onContextIssue = callbacks.onContextIssue;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Crisp overcast daylight sky & subtle horizon fog
    this.scene.background = new THREE.Color(0xb8c4ce);
    this.scene.fog = new THREE.FogExp2(0xaeb9c2, 0.0052);

    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.cameraCtrl = new CameraController(aspect);
    this.scene.add(this.cameraCtrl.camera);

    this.input = new InputManager(this.renderer.domElement, this.settings, {
      onModeChanged: () => this.emitHudSnapshot(),
      onPointerLockChanged: () => {
        if (!this.input.isPointerLocked() && this.screen === 'playing') {
          this.isFiring = false;
          this.isAiming = false;
        }
        this.emitHudSnapshot();
      },
      onUnlockAudio: () => this.audio.unlock(),
      onToggleInventory: () => {
        if (this.screen === 'playing') {
          this.setScreen('inventory');
        } else if (this.screen === 'inventory') {
          this.resumePlaying();
        }
      },
      onTogglePause: () => {
        if (this.screen === 'playing' || this.screen === 'inventory') {
          this.setScreen('paused');
        } else if (this.screen === 'paused') {
          this.resumePlaying();
        }
      },
    });

    this.setupLightingAndEnvironment();
    this.bindEvents();

    void this.initAsync(callbacks.onReady, callbacks.onInitError);
  }

  private setupLightingAndEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // Cool sky / earthy ground hemisphere fill for overcast daylight
    this.hemiLight = new THREE.HemisphereLight(0xdce6ef, 0x4b5545, 0.88);
    this.hemiLight.position.set(0, 80, 0);
    this.scene.add(this.hemiLight);

    // Soft overcast directional sunlight
    this.sunLight = new THREE.DirectionalLight(0xf6f8fa, 1.45);
    this.sunLight.position.set(75, 110, 55);
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 280;
    const d = 125;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle cool rim fill from opposite horizon
    const fill = new THREE.DirectionalLight(0xc2d2e0, 0.42);
    fill.position.set(-70, 45, -65);
    this.scene.add(fill);
  }

  private applyMapAtmosphere(mapId: MapId): void {
    const spec = MAP_CATALOG[mapId];
    this.scene.background = new THREE.Color(spec.skyColor);
    const qualityMult =
      this.settings.quality === 'low' ? 1.35 : this.settings.quality === 'medium' ? 1.05 : 0.88;
    this.scene.fog = new THREE.FogExp2(spec.fogColor, spec.fogDensityBase * qualityMult);
    this.hemiLight.color.setHex(spec.hemiSkyColor);
    this.hemiLight.groundColor.setHex(spec.hemiGroundColor);
    this.hemiLight.intensity = spec.hemiIntensity;
    this.sunLight.color.setHex(spec.sunColor);
    this.sunLight.intensity = spec.sunIntensity;
  }

  private async initAsync(
    onReady: () => void,
    onInitError?: (message: string) => void,
  ): Promise<void> {
    try {
      const [, charBundle] = await Promise.all([
        this.physics.init(),
        this.characterLoader.loadAll(),
      ]);
      if (this.disposed) return;

      this.characterBundle = charBundle;
      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      this.materials = new MaterialLibrary(maxAniso);
      this.weaponFactory = new WeaponModelsFactory(maxAniso);
      this.characterAppearance = new CharacterAppearanceLibrary(maxAniso);
      this.map = new IslandMap(this.materials, this.physics, this.activeMapId);
      this.scene.add(this.map.root);
      this.applyMapAtmosphere(this.activeMapId);

      this.inventory = new InventorySystem(this.materials);
      this.scene.add(this.inventory.lootGroup);

      this.safeZone = new SafeZoneSystem();
      this.scene.add(this.safeZone.wallMesh);

      this.combat = new CombatSystem(this.physics);
      this.scene.add(this.combat.fxGroup);
      this.scene.add(this.vehicles.group);

      this.avatar = new PlayerAvatar(
        this.characterBundle,
        this.characterLoader,
        this.characterAppearance,
        this.weaponFactory,
      );
      this.scene.add(this.avatar.bodyGroup);
      this.cameraCtrl.camera.add(this.avatar.viewmodelGroup);

      this.physics.createPlayerController(0, this.map.getHeightAt(0, 0) + 1.1, 0);
      this.vehicles.spawnForMap(this.activeMapId, this.physics);
      this.applySettings(this.settings);

      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.cameraCtrl.camera);
      }

      this.ready = true;
      this.loop = new GameLoop(this.renderer, this.isSoftwareGl, (dt, elapsed) =>
        this.update(dt, elapsed),
      );
      this.loop.start();
      this.emitHudSnapshot();
      onReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('LAST ZONE initialization error:', err);
      onInitError?.(message);
    }
  }

  public selectMap(mapId: MapId): void {
    if (!this.ready || this.disposed || this.activeMapId === mapId) return;
    this.activeMapId = mapId;

    this.audio.stopEngine();
    this.clearBotRigs();
    this.ai.bots = [];
    this.inventory.clearWorldLoot();
    this.vehicles.clear(this.physics);

    if (this.map) {
      this.scene.remove(this.map.root);
      this.map.dispose();
    }

    this.physics.resetWorld();
    this.map = new IslandMap(this.materials, this.physics, mapId);
    this.scene.add(this.map.root);
    this.physics.createPlayerController(0, this.map.getHeightAt(0, 0) + 1.1, 0);
    this.vehicles.spawnForMap(mapId, this.physics);

    this.applyMapAtmosphere(mapId);
    this.map.environment.applyQuality(this.settings.quality);
    this.emitHudSnapshot();
  }

  public getMinimapCanvas(): HTMLCanvasElement | null {
    return this.map ? this.map.minimapCanvas : null;
  }

  public getTouchInput(): TouchInput {
    return this.input.touch;
  }

  public startNewMatch(): void {
    if (!this.ready) return;
    this.audio.unlock();
    this.audio.stopEngine();

    this.health.reset();
    this.inventory.resetStarterLoadout();
    this.inventory.populateWorldLoot(this.map.generateLootLocations());
    this.safeZone.reset();
    this.map.resetDoors();

    // Clear old bot rigs and respawn vehicles cleanly for match
    this.clearBotRigs();
    this.ai.bots = [];
    this.ramCooldownByBot.clear();
    this.vehicles.spawnForMap(this.activeMapId, this.physics);
    this.avatar.resetVisualState();
    this.avatar.setArmorEquipment(
      this.inventory.equipped.helmetDurability > 0,
      this.inventory.equipped.vestDurability > 0,
    );

    const spawns = this.map.generateSpawnPoints(TOTAL_COMBATANTS);
    const playerSpawn = spawns[0];
    this.movement.reset(playerSpawn.x, playerSpawn.y, playerSpawn.z, this.physics);
    this.cameraCtrl.yaw = Math.atan2(playerSpawn.x, playerSpawn.z); // Face roughly inward toward center
    this.cameraCtrl.pitch = 0;

    for (let i = 1; i < spawns.length; i++) {
      const sp = spawns[i];
      const bot = createBotEntity(i - 1, sp.x, sp.y, sp.z, -1);
      this.ai.bots.push(bot);
      this.createBotVisualRig(bot);
    }

    this.kills = 0;
    this.damageDealt = 0;
    this.matchTimeSec = 0;
    this.eliminatedBy = null;
    this.hitMarkerAlpha = 0;
    this.damageFlashAlpha = 0;
    this.reloadTimer = null;
    this.killFeed = [];
    this.gunfireBlips = [];
    this.isFiring = false;
    this.prevFireHeld = false;
    this.isAiming = false;
    this.lastPlayerFireTime = -10;
    this.input.resetForNewMatch();

    this.setScreen('playing');
    this.requestPointerLock();
    this.emitHudSnapshot();
  }

  private clearBotRigs(): void {
    this.botRigs.forEach((rig) => {
      this.scene.remove(rig.character.root);
      rig.character.dispose();
    });
    this.botRigs.clear();
  }

  private createBotVisualRig(bot: BotEntity): void {
    const appearance = createBotAppearancePreset(bot.variantIndex);
    const character = new CharacterInstance(
      this.characterBundle,
      (tpl) => this.characterLoader.instantiate(tpl),
      this.characterAppearance,
      this.weaponFactory,
      appearance,
      { isPlayer: false, lod0Dist: 34, cullDist: 120 },
    );
    character.equipment.setActiveWeapon(bot.weapon.id as WeaponModelId);
    character.root.position.set(bot.x, bot.y, bot.z);
    character.root.rotation.y = bot.yaw;
    this.scene.add(character.root);
    this.botRigs.set(bot.id, {
      character,
      lastHitToken: bot.hitReactionToken,
      eliminationTriggered: false,
    });
  }

  public setScreen(next: GameScreen): void {
    this.screen = next;
    this.input.setScreen(next);
    if (next !== 'playing') {
      this.isFiring = false;
      this.prevFireHeld = false;
      this.isAiming = false;
      this.audio.stopEngine();
      this.input.clearActiveStates();
    }
    this.emitHudSnapshot();
  }

  public resumePlaying(): void {
    if (this.health.eliminated) return;
    this.audio.unlock();
    this.setScreen('playing');
    const activeVeh = this.vehicles.getPlayerVehicle('player');
    if (activeVeh && !activeVeh.destroyed) {
      this.audio.startEngine(activeVeh.spec.type);
    }
    this.requestPointerLock();
  }

  public requestPointerLock(): void {
    this.input.requestPointerLock();
  }

  public applySettings(next: GameSettings): void {
    this.settings = { ...next };
    this.ai.setDifficulty(next.difficulty);
    this.input.applySettings(next);
    this.audio.setVolume(next.masterVolume);
    this.cameraCtrl.setBaseFov(next.fov);

    const pixelRatio = this.isSoftwareGl
      ? 1
      : next.quality === 'low'
        ? 0.8
        : next.quality === 'medium'
          ? 1.0
          : Math.min(window.devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(pixelRatio);

    const shadowsActive = next.shadows && !this.isSoftwareGl && next.quality !== 'low';
    this.renderer.shadowMap.enabled = shadowsActive;
    this.sunLight.castShadow = shadowsActive;

    const spec = MAP_CATALOG[this.activeMapId];
    const qualityMult =
      next.quality === 'low' ? 1.35 : next.quality === 'medium' ? 1.05 : 0.88;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = spec.fogDensityBase * qualityMult;
    }

    if (this.map) {
      this.map.environment.applyQuality(next.quality);
    }
  }

  // UI Interactive Commands
  public equipInventoryItem(uid: string): void {
    this.inventory.equipItemFromBackpack(uid);
    this.audio.playPickup();
    this.emitHudSnapshot();
  }

  public useMedicalItem(uid?: string): void {
    if (this.health.eliminated || this.health.health >= this.health.maxHealth) return;
    const item = this.inventory.consumeMedicalItem(uid);
    if (!item) return;
    this.reloadTimer = null;
    this.health.startHealing(item);
    this.emitHudSnapshot();
  }

  public dropInventoryItem(uid: string): void {
    this.inventory.dropItem(
      uid,
      this.movement.position.x,
      this.movement.getFeetY(),
      this.movement.position.z,
    );
    this.emitHudSnapshot();
  }

  public switchWeaponSlot(slot: 'primary' | 'secondary'): void {
    this.reloadTimer = null;
    this.inventory.switchSlot(slot);
    this.audio.playPickup();
    this.emitHudSnapshot();
  }

  public toggleCameraMode(): void {
    if (this.vehicles.getPlayerVehicle('player')) {
      this.cameraCtrl.cycleDrivingZoom();
    } else {
      this.cameraCtrl.toggleMode();
    }
    this.emitHudSnapshot();
  }

  public triggerVehicleInteractAction(): void {
    if (this.screen !== 'playing' || this.health.eliminated) return;
    this.handleVehicleInteract();
    this.emitHudSnapshot();
  }

  private handleVehicleInteract(): void {
    const activeVeh = this.vehicles.getPlayerVehicle('player');
    if (activeVeh) {
      this.exitCurrentVehicle();
      return;
    }

    const entered = this.vehicles.tryEnterNearest(
      'player',
      this.movement.position.x,
      this.movement.getFeetY(),
      this.movement.position.z,
    );
    if (!entered) return;

    this.reloadTimer = null;
    this.health.cancelHealing();
    this.isFiring = false;
    this.prevFireHeld = false;
    this.isAiming = false;

    this.avatar.bodyGroup.visible = false;
    this.avatar.viewmodelGroup.visible = false;
    this.cameraCtrl.resetDrivingFollow();
    this.cameraCtrl.yaw = entered.physics.yaw;
    this.audio.playVehicleDoor(true);
    this.audio.startEngine(entered.spec.type);
  }

  private exitCurrentVehicle(): void {
    const exited = this.vehicles.exitVehicle(
      'player',
      this.physics,
      this.map.getObstacles(),
      this.activeMapId,
    );
    if (!exited) return;

    this.movement.reset(
      exited.exitPos.x,
      exited.exitPos.y,
      exited.exitPos.z,
      this.physics,
    );
    this.avatar.bodyGroup.visible = this.cameraCtrl.mode === 'third-person';
    this.avatar.viewmodelGroup.visible = this.cameraCtrl.mode === 'first-person';
    this.audio.stopEngine();
    this.audio.playVehicleDoor(false);
  }

  private handleVehicleDestroyed(vehicle: VehicleInstance): void {
    this.audio.playVehicleCollision(1.0);
    if (vehicle.occupantId === 'player') {
      this.exitCurrentVehicle();
      this.health.applyDamage(22, false, this.inventory.equipped, true);
      this.damageFlashAlpha = 0.85;
      this.cameraCtrl.addImpactShake(0.28);
      if (this.health.eliminated) {
        this.handlePlayerEliminated(`${vehicle.spec.name} Wreckage`);
      }
    }
  }

  private update(dt: number, elapsed: number): void {
    if (!this.ready || this.disposed) return;
    this.currentElapsed = elapsed;

    const playerInput = this.input.pollInput();

    if (this.screen === 'menu') {
      // Gentle cinematic flyover camera over the 4-zone island on Main Menu
      this.menuOrbitAngle += dt * 0.085;
      const r = 105;
      const cx = Math.cos(this.menuOrbitAngle) * r;
      const cz = Math.sin(this.menuOrbitAngle) * r;
      this.cameraCtrl.camera.position.set(cx, 38, cz);
      this.cameraCtrl.camera.lookAt(0, 4, 0);
      this.safeZone.update(dt * 0.4, elapsed);
      this.renderer.render(this.scene, this.cameraCtrl.camera);
      return;
    }

    if (playerInput.toggleInventory) {
      if (this.screen === 'playing') {
        this.setScreen('inventory');
      } else if (this.screen === 'inventory') {
        this.resumePlaying();
      }
    } else if (playerInput.togglePause) {
      if (this.screen === 'playing' || this.screen === 'inventory') {
        this.setScreen('paused');
      } else if (this.screen === 'paused') {
        this.resumePlaying();
      }
    }

    // Active simulation update when playing or inventory is open (world remains live!)
    const simActive = this.screen === 'playing' || this.screen === 'inventory';
    if (simActive && !this.health.eliminated) {
      this.matchTimeSec += dt;
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.hitMarkerAlpha = Math.max(0, this.hitMarkerAlpha - dt * 3.2);
      this.damageFlashAlpha = Math.max(0, this.damageFlashAlpha - dt * 2.1);

      // Decay gunfire minimap blips
      for (let i = this.gunfireBlips.length - 1; i >= 0; i--) {
        this.gunfireBlips[i].timeLeft -= dt;
        if (this.gunfireBlips[i].timeLeft <= 0) {
          this.gunfireBlips.splice(i, 1);
        }
      }

      if (this.screen === 'playing') {
        if (playerInput.lookDeltaX !== 0 || playerInput.lookDeltaY !== 0) {
          this.cameraCtrl.addLookDelta(playerInput.lookDeltaX, playerInput.lookDeltaY, 1.0);
        }
        if (playerInput.vehicleInteract) {
          this.handleVehicleInteract();
        }
      }

      let activeVeh = this.vehicles.getPlayerVehicle('player');

      if (this.screen === 'playing') {
        if (playerInput.toggleCamera) {
          this.toggleCameraMode();
        }

        if (!activeVeh) {
          if (playerInput.doorInteract) {
            this.toggleNearestDoorAction();
          }
          if (playerInput.interact) {
            this.handleInteractAction();
          }
          if (playerInput.reload) {
            this.startReload();
          }
          if (playerInput.switchPrimary) {
            this.switchWeaponSlot('primary');
          } else if (playerInput.switchSecondary) {
            this.switchWeaponSlot('secondary');
          } else if (playerInput.cycleWeapon) {
            const nextSlot =
              this.inventory.equipped.activeSlot === 'primary'
                ? 'secondary'
                : this.inventory.equipped.primary
                  ? 'primary'
                  : 'secondary';
            this.switchWeaponSlot(nextSlot);
          }
          if (playerInput.quickHeal) {
            const med = this.inventory.findBestMedicalItem();
            if (med) this.useMedicalItem(med.uid);
          }

          this.isAiming = playerInput.aim;
          const fireJustPressed = playerInput.fire && !this.prevFireHeld;
          this.prevFireHeld = playerInput.fire;

          if (fireJustPressed) {
            this.isFiring = true;
            this.tryPlayerFire();
          } else if (!playerInput.fire) {
            this.isFiring = false;
          }
        } else {
          this.prevFireHeld = false;
          this.isFiring = false;
          this.isAiming = false;
        }
      } else {
        this.prevFireHeld = false;
        this.isFiring = false;
        this.isAiming = false;
      }

      const mapHeightAt = (x: number, z: number) => this.map.getHeightAt(x, z);

      // 1. Player or Vehicle Physics Update
      if (!activeVeh) {
        const activeInput =
          this.screen === 'playing'
            ? {
                moveX: playerInput.moveX,
                moveY: playerInput.moveY,
                sprint: playerInput.sprint,
                crouch: playerInput.crouch,
                jump: playerInput.jumpHeld || playerInput.jumpPressed,
              }
            : {
                moveX: 0,
                moveY: 0,
                sprint: false,
                crouch: this.movement.isCrouching,
                jump: false,
              };

        this.movement.update(
          dt,
          this.cameraCtrl.yaw,
          activeInput,
          this.physics,
          this.health,
          mapHeightAt,
        );

        if (this.movement.isMoving && this.movement.grounded) {
          const zone = this.map.getZoneAt(this.movement.position.x, this.movement.position.z);
          this.audio.playFootstep(
            this.movement.isSprinting,
            zone === 'urban' || zone === 'industrial',
          );
        }

        this.vehicles.update(
          dt,
          elapsed,
          null,
          { throttle: 0, steer: 0, handbrake: true },
          this.cameraCtrl.camera.position,
          this.physics,
          this.activeMapId,
          (ev) => {
            if (ev.impactSpeed > 4.2) {
              this.audio.playVehicleCollision(Math.min(0.6, ev.impactSpeed / 20));
            }
          },
          (v) => this.handleVehicleDestroyed(v),
        );
      } else {
        const driverInput =
          this.screen === 'playing'
            ? {
                throttle: playerInput.moveY,
                steer: playerInput.moveX,
                handbrake: playerInput.jumpHeld,
              }
            : { throttle: 0, steer: 0, handbrake: true };

        this.vehicles.update(
          dt,
          elapsed,
          'player',
          driverInput,
          this.cameraCtrl.camera.position,
          this.physics,
          this.activeMapId,
          (ev) => {
            if (ev.isOccupiedByPlayer && ev.impactSpeed > 3.0) {
              const norm = Math.min(1, ev.impactSpeed / 18);
              this.audio.playVehicleCollision(norm);
              this.cameraCtrl.addImpactShake(0.06 + norm * 0.2);
            }
          },
          (v) => this.handleVehicleDestroyed(v),
        );

        activeVeh = this.vehicles.getPlayerVehicle('player');
        if (activeVeh) {
          this.movement.position.x = activeVeh.physics.x;
          this.movement.position.y = activeVeh.physics.y + 1.05;
          this.movement.position.z = activeVeh.physics.z;
          this.movement.horizontalSpeed = Math.abs(activeVeh.physics.forwardSpeed);
          this.movement.isMoving = false;
          this.movement.isSprinting = false;
          this.physics.teleportPlayer(
            activeVeh.physics.x,
            activeVeh.physics.y + 1.05,
            activeVeh.physics.z,
          );
          this.physics.stepWorld();

          const speedRatio =
            Math.abs(activeVeh.physics.forwardSpeed) /
            Math.max(1, activeVeh.spec.maxSpeedForward);
          this.audio.updateEngine(speedRatio, Math.abs(driverInput.throttle));

          // Acoustic alerting for AI when driving quickly
          if (Math.abs(activeVeh.physics.forwardSpeed) > 6.0 && Math.random() < dt * 2.2) {
            this.ai.notifySoundEvent(
              activeVeh.physics.x,
              activeVeh.physics.y,
              activeVeh.physics.z,
              'player',
              56,
              this.currentElapsed,
            );
          }

          // Vehicle-vs-bot impact check
          const vehSpeed = Math.abs(activeVeh.physics.forwardSpeed);
          if (vehSpeed > 5.5) {
            const hitRad = activeVeh.spec.width * 0.56 + 0.58;
            for (const bot of this.ai.bots) {
              if (bot.state === 'Eliminated') continue;
              const lastHit = this.ramCooldownByBot.get(bot.id) ?? -10;
              if (elapsed - lastHit < 0.7) continue;
              const dist = Math.hypot(
                bot.x - activeVeh.physics.x,
                bot.z - activeVeh.physics.z,
              );
              if (dist < hitRad && Math.abs(bot.y - activeVeh.physics.y) < 2.2) {
                this.ramCooldownByBot.set(bot.id, elapsed);
                const ramDmg = Math.round(vehSpeed * 4.2);
                const res = this.ai.applyDamageToBot(
                  bot,
                  ramDmg,
                  'player',
                  this.currentElapsed,
                );
                this.damageDealt += Math.round(res.damage);
                this.hitMarkerAlpha = 1.0;
                this.hitMarkerKill = res.eliminated;
                this.audio.playVehicleCollision(Math.min(1, vehSpeed / 18));
                this.audio.playHitMarker(res.eliminated);
                if (res.eliminated) {
                  this.kills += 1;
                  this.handleBotEliminated(bot, 'You', activeVeh.spec.name);
                }
              }
            }
          }
        } else {
          this.physics.stepWorld();
        }
      }

      // 2. Healing & Reloading timers
      if (this.health.isHealing()) {
        if (this.movement.isSprinting || this.isFiring || activeVeh) {
          this.health.cancelHealing();
        } else {
          const healed = this.health.updateHealing(dt);
          if (healed) {
            this.audio.playHealComplete();
          }
        }
      }

      if (this.reloadTimer) {
        this.reloadTimer.elapsed += dt;
        if (this.reloadTimer.elapsed >= this.reloadTimer.total) {
          this.inventory.completeReloadActive();
          this.audio.playReload();
          this.reloadTimer = null;
        }
      }

      // 3. Automatic / Continuous Player Firing (on foot)
      if (this.screen === 'playing' && this.isFiring && !activeVeh) {
        this.tryPlayerFire();
      }

      // 4. Safe Zone update & player storm damage
      this.safeZone.update(dt, elapsed);
      if (this.safeZone.isPointOutside(this.movement.position.x, this.movement.position.z)) {
        this.health.applyDamage(
          this.safeZone.damagePerSecond * dt,
          false,
          this.inventory.equipped,
          true,
        );
        this.audio.playZoneWarning();
        if (this.health.eliminated) {
          this.handlePlayerEliminated('Safe Zone Storm');
        }
      }

      // 5. Loot hover animation & animated building doors
      this.inventory.updateLootVisuals(elapsed);
      this.map.update(dt);

      // 6. AI Opponents FSM update & visual sync
      const playerFeetY = this.movement.getFeetY();
      this.ai.update(
        dt,
        elapsed,
        {
          id: 'player',
          name: 'You',
          x: this.movement.position.x,
          y: playerFeetY,
          z: this.movement.position.z,
          alive: !this.health.eliminated,
          health: this.health.health,
          maxHealth: this.health.maxHealth,
          isCrouching: this.movement.isCrouching,
          isSprinting: this.movement.isSprinting || Boolean(activeVeh),
          lastFiredAt: this.lastPlayerFireTime,
        },
        this.safeZone,
        this.physics,
        this.map.getObstacles(),
        (ev) => this.handleBotFire(ev),
        (bot) => this.handleBotEliminated(bot, 'Safe Zone', 'Storm'),
        mapHeightAt,
        this.map.multiStoryBuildings,
        (dx, _dy, dz, opening) => {
          const dist = Math.hypot(dx - this.movement.position.x, dz - this.movement.position.z);
          this.audio.playDoorToggle(opening, Math.max(0, 1 - dist / 34));
        },
      );

      this.syncBotVisuals(dt);

      // 7. Combat tracer/impact VFX
      this.combat.update(dt);

      // 8. Player Camera & Avatar
      const activeWeapon = this.inventory.getActiveWeapon();
      const adsDelta = activeWeapon ? activeWeapon.adsFovDelta : -10;
      if (activeVeh) {
        this.cameraCtrl.updateDrivingCamera(
          dt,
          activeVeh.physics.x,
          activeVeh.physics.y,
          activeVeh.physics.z,
          activeVeh.physics.yaw,
          activeVeh.physics.forwardSpeed,
          activeVeh.spec.maxSpeedForward,
          activeVeh.spec.defaultCamDist,
          activeVeh.spec.camHeight,
          this.physics,
          this.physics.playerCollider.handle,
          activeVeh.physics.collider.handle,
        );
        this.avatar.bodyGroup.visible = false;
        this.avatar.viewmodelGroup.visible = false;
      } else {
        this.cameraCtrl.update(
          dt,
          this.movement.position.x,
          playerFeetY,
          this.movement.position.z,
          this.movement.isCrouching,
          this.isAiming && !this.reloadTimer,
          adsDelta,
          this.physics,
          this.physics.playerCollider.handle,
        );

        this.avatar.setArmorEquipment(
          this.inventory.equipped.helmetDurability > 0,
          this.inventory.equipped.vestDurability > 0,
        );

        this.avatar.updateVisuals(
          dt,
          this.movement,
          this.cameraCtrl,
          this.isAiming,
          this.reloadTimer !== null,
          activeWeapon?.id,
          this.health.eliminated,
        );
      }

      // Keep shadow frustum centered near player for crisp shadows
      this.sunLight.position.set(
        this.movement.position.x + 65,
        105,
        this.movement.position.z + 45,
      );
      this.sunLight.target.position.set(
        this.movement.position.x,
        0,
        this.movement.position.z,
      );

      // Check Victory Condition
      const aliveBots = this.countAliveBots();
      if (aliveBots === 0 && !this.health.eliminated) {
        this.finishMatch(true);
      }
    }

    this.renderer.render(this.scene, this.cameraCtrl.camera);

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHudSnapshot();
    }
  }

  private tryPlayerFire(): void {
    const weapon = this.inventory.getActiveWeapon();
    if (!weapon || this.fireCooldown > 0 || this.reloadTimer) return;

    if (this.inventory.getActiveMagAmmo() <= 0) {
      if (this.inventory.canReloadActive()) {
        this.startReload();
      }
      this.isFiring = false;
      return;
    }

    this.health.cancelHealing();
    this.inventory.consumeActiveAmmo();
    this.fireCooldown = 1 / weapon.fireRate;
    if (!weapon.automatic) {
      this.isFiring = false;
    }

    this.audio.playGunshot(weapon.id, 1);
    this.lastPlayerFireTime = this.currentElapsed;
    this.ai.notifySoundEvent(
      this.movement.position.x,
      this.movement.getFeetY(),
      this.movement.position.z,
      'player',
      weapon.id === 'mr12' ? 95 : weapon.id === 'p9' ? 68 : 84,
      this.currentElapsed,
    );
    this.avatar.triggerFireKick();
    this.cameraCtrl.addRecoil(weapon.recoil * (this.isAiming ? 0.65 : 1.0));

    _camOrigin.copy(this.cameraCtrl.camera.position);
    this.cameraCtrl.getAimForward(_camForward);

    if (this.cameraCtrl.mode === 'first-person') {
      this.avatar.getMuzzleWorldPosition(_muzzlePos);
    } else if (!this.avatar.getThirdPersonMuzzleWorldPosition(_muzzlePos)) {
      _muzzlePos.set(
        this.movement.position.x,
        this.movement.getFeetY() + 1.35,
        this.movement.position.z,
      );
    }

    const targets: CombatTarget[] = this.ai.bots.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      z: b.z,
      height: 1.82,
      radius: 0.48,
      alive: b.state !== 'Eliminated',
    }));

    const spreadMult =
      (this.movement.isCrouching ? 0.65 : 1.0) * (this.isAiming ? 0.45 : 1.0);

    const outcomes = this.combat.fireWeaponRay(
      _camOrigin,
      _camForward,
      _muzzlePos,
      weapon,
      targets,
      spreadMult,
      this.physics.playerCollider.handle,
    );

    let anyHit = false;
    let anyKill = false;
    for (const out of outcomes) {
      if (out.hitVehicleId) {
        const vehRes = this.vehicles.applyDamage(out.hitVehicleId, out.damage);
        if (vehRes) {
          this.hitMarkerAlpha = Math.max(this.hitMarkerAlpha, 0.7);
          if (vehRes.justDestroyed) {
            this.handleVehicleDestroyed(vehRes.vehicle);
          }
        }
        continue;
      }
      if (!out.hitTargetId) continue;
      const bot = this.ai.bots.find((b) => b.id === out.hitTargetId);
      if (!bot || bot.state === 'Eliminated') continue;

      const res = this.ai.applyDamageToBot(bot, out.damage, 'player', this.currentElapsed);
      this.damageDealt += Math.round(res.damage);
      anyHit = true;

      if (res.eliminated) {
        anyKill = true;
        this.kills += 1;
        this.handleBotEliminated(bot, 'You', weapon.name);
      }
    }

    if (anyHit) {
      this.hitMarkerAlpha = 1.0;
      this.hitMarkerKill = anyKill;
      this.audio.playHitMarker(anyKill);
    }
  }

  private handleBotFire(ev: BotFireEvent): void {
    const distToPlayer = Math.hypot(
      ev.bot.x - this.movement.position.x,
      ev.bot.z - this.movement.position.z,
    );
    const audioScale = Math.max(0, 1 - distToPlayer / 135);
    this.audio.playGunshot(ev.bot.weapon.id, audioScale * 0.72);

    this.gunfireBlips.push({ x: ev.bot.x, z: ev.bot.z, timeLeft: 2.2 });
    this.ai.notifySoundEvent(
      ev.bot.x,
      ev.bot.y,
      ev.bot.z,
      ev.bot.id,
      ev.bot.weapon.id === 'mr12' ? 92 : 78,
      this.currentElapsed,
    );

    _botOrigin.set(ev.bot.x, ev.bot.y + 1.45, ev.bot.z);
    const botRig = this.botRigs.get(ev.bot.id);
    if (!botRig || !botRig.character.equipment.getWeaponMuzzleWorld(_botMuzzle)) {
      _botMuzzle.set(ev.bot.x, ev.bot.y + 1.32, ev.bot.z);
    }
    _botDir
      .set(ev.target.x - ev.bot.x, ev.target.y + 1.2 - (ev.bot.y + 1.45), ev.target.z - ev.bot.z)
      .normalize();

    this.combat.fireWeaponRay(_botOrigin, _botDir, _botMuzzle, ev.bot.weapon, [], ev.hit ? 0.85 : 1.9);

    if (!ev.hit) return;

    if (ev.target.id === 'player') {
      const playerVeh = this.vehicles.getPlayerVehicle('player');
      let playerDmg = ev.damage;
      if (playerVeh) {
        // Vehicle chassis absorbs 70% of incoming gunfire
        const armorDmg = Math.max(2, Math.round(ev.damage * 0.75));
        playerDmg = Math.max(1, Math.round(ev.damage * 0.3));
        const res = this.vehicles.applyDamage(playerVeh.id, armorDmg);
        if (res?.justDestroyed) {
          this.handleVehicleDestroyed(res.vehicle);
        }
      }
      if (!this.health.eliminated) {
        this.health.applyDamage(playerDmg, ev.isHeadshot, this.inventory.equipped, false);
        this.damageFlashAlpha = 0.85;
        this.audio.playDamageTaken();
        this.avatar.triggerHitReaction();
        if (this.health.eliminated) {
          this.handlePlayerEliminated(`${ev.bot.name} (${ev.bot.weapon.name})`);
        }
      }
    } else {
      const targetBot = this.ai.bots.find((b) => b.id === ev.target.id);
      if (targetBot && targetBot.state !== 'Eliminated') {
        const res = this.ai.applyDamageToBot(targetBot, ev.damage, ev.bot.id, this.currentElapsed);
        if (res.eliminated) {
          this.handleBotEliminated(targetBot, ev.bot.name, ev.bot.weapon.name);
        }
      }
    }
  }

  private handleBotEliminated(bot: BotEntity, killerName: string, weaponName: string): void {
    const rig = this.botRigs.get(bot.id);
    if (rig && !rig.eliminationTriggered) {
      rig.eliminationTriggered = true;
      rig.character.animator.triggerElimination();
    }

    this.pushKillFeed(killerName, bot.name, weaponName);

    // Drop bot's primary/medical loot crate at elimination site
    this.inventory.spawnWorldLoot(
      {
        uid: `drop-${bot.id}-${Date.now()}`,
        id: bot.weapon.id,
        name: bot.weapon.name,
        category: bot.weapon.slot === 'primary' ? 'primary' : 'ammo',
        quantity: bot.weapon.slot === 'primary' ? 1 : 20,
        description: `${bot.weapon.ammoType} dropped gear`,
        weaponSpec: bot.weapon.slot === 'primary' ? bot.weapon : undefined,
      },
      bot.x,
      bot.y,
      bot.z,
    );
  }

  private handlePlayerEliminated(by: string): void {
    this.eliminatedBy = by;
    this.audio.stopEngine();
    this.avatar.triggerElimination();
    this.pushKillFeed(by, 'You', '');
    this.finishMatch(false);
  }

  private finishMatch(victory: boolean): void {
    if (this.screen === 'results') return;
    this.audio.stopEngine();
    this.audio.playMatchEnd(victory);
    const aliveBots = this.countAliveBots();
    const placement = victory ? 1 : aliveBots + 1;
    this.setScreen('results');
    this.onMatchEnd({
      victory,
      placement,
      totalCombatants: TOTAL_COMBATANTS,
      kills: this.kills,
      damageDealt: this.damageDealt,
      survivalTimeSec: Math.round(this.matchTimeSec),
      zoneSurvived: Math.max(0, this.safeZone.phase - 1),
      eliminatedBy: this.eliminatedBy,
    });
  }

  private pushKillFeed(killer: string, victim: string, weapon: string): void {
    this.killFeed.unshift({
      id: `${Date.now()}-${Math.random()}`,
      killer,
      victim,
      weapon,
      timestamp: performance.now(),
    });
    if (this.killFeed.length > 4) {
      this.killFeed.length = 4;
    }
  }

  private syncBotVisuals(dt: number): void {
    this.cameraCtrl.camera.updateMatrixWorld();
    CharacterLODController.updateCameraFrustum(this.cameraCtrl.camera);
    const camPos = this.cameraCtrl.camera.position;

    for (const bot of this.ai.bots) {
      const rig = this.botRigs.get(bot.id);
      if (!rig) continue;

      if (bot.hitReactionToken !== rig.lastHitToken) {
        rig.lastHitToken = bot.hitReactionToken;
        if (bot.state !== 'Eliminated') {
          rig.character.animator.triggerHitReaction();
        }
      }

      if (bot.state === 'Eliminated' && !rig.eliminationTriggered) {
        rig.eliminationTriggered = true;
        rig.character.animator.triggerElimination();
      }

      rig.character.update(
        dt,
        bot.x,
        bot.y,
        bot.z,
        bot.yaw,
        {
          isMoving: bot.isMoving,
          isSprinting: bot.isSprinting,
          isCrouching: false,
          isGrounded: true,
          isAiming: bot.isAiming,
          isReloading: false,
          isEliminated: bot.state === 'Eliminated',
          moveSpeed: bot.moveSpeed,
          weaponId: bot.weapon.id as WeaponModelId,
        },
        camPos,
      );
    }
  }

  private countAliveBots(): number {
    let count = 0;
    for (const b of this.ai.bots) {
      if (b.state !== 'Eliminated') count += 1;
    }
    return count;
  }

  private startReload(): void {
    const wpn = this.inventory.getActiveWeapon();
    if (!wpn || this.reloadTimer || !this.inventory.canReloadActive()) return;
    this.health.cancelHealing();
    this.reloadTimer = {
      elapsed: 0,
      total: wpn.reloadTime,
      weaponName: wpn.name,
    };
    this.audio.playReload();
  }

  private handleInteractAction(): void {
    const px = this.movement.position.x;
    const py = this.movement.getFeetY();
    const pz = this.movement.position.z;

    const lootMatch = this.inventory.findNearestLootWithDistance(px, py, pz);
    const doorMatch = this.map.findNearestDoor(px, py, pz);

    if (doorMatch && (!lootMatch || doorMatch.distSq <= lootMatch.distSq)) {
      const res = this.map.toggleDoor(doorMatch.prompt.id);
      if (res) {
        this.audio.playDoorToggle(res.isOpen, 1);
        this.emitHudSnapshot();
      }
      return;
    }

    if (lootMatch) {
      this.pickupNearestLootAction();
    }
  }

  private toggleNearestDoorAction(): void {
    const doorMatch = this.map.findNearestDoor(
      this.movement.position.x,
      this.movement.getFeetY(),
      this.movement.position.z,
    );
    if (!doorMatch) return;
    const res = this.map.toggleDoor(doorMatch.prompt.id);
    if (res) {
      this.audio.playDoorToggle(res.isOpen, 1);
      this.emitHudSnapshot();
    }
  }

  private pickupNearestLootAction(): void {
    const picked = this.inventory.pickupNearestLoot(
      this.movement.position.x,
      this.movement.getFeetY(),
      this.movement.position.z,
    );
    if (picked) {
      this.audio.playPickup();
      this.emitHudSnapshot();
    }
  }

  private emitHudSnapshot(): void {
    if (!this.ready) return;
    const playerFeetY = this.movement.getFeetY();
    const yawDeg = (((-this.cameraCtrl.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const blips: MinimapBlip[] = [
      ...this.vehicles.getMinimapBlips(),
      ...this.gunfireBlips.map((b) => ({
        x: b.x,
        z: b.z,
        kind: 'gunfire' as const,
        alpha: Math.min(1, b.timeLeft / 2.2),
      })),
    ];

    const currentZone = this.map.getZoneAt(this.movement.position.x, this.movement.position.z);
    const mapSpec = MAP_CATALOG[this.activeMapId];
    const activeVeh = this.vehicles.getPlayerVehicle('player');
    const vehiclePrompt = activeVeh
      ? null
      : this.vehicles.findNearestInteractable(
          this.movement.position.x,
          playerFeetY,
          this.movement.position.z,
        );

    const lootMatch = activeVeh
      ? null
      : this.inventory.findNearestLootWithDistance(
          this.movement.position.x,
          playerFeetY,
          this.movement.position.z,
        );
    const doorMatch = activeVeh
      ? null
      : this.map.findNearestDoor(
          this.movement.position.x,
          playerFeetY,
          this.movement.position.z,
        );

    const isTouch = this.input.getResolvedMode() === 'touch';
    const desktopPreferDoor =
      !isTouch && doorMatch !== null && (!lootMatch || doorMatch.distSq <= lootMatch.distSq);

    this.onHudUpdate({
      screen: this.screen,
      mapId: this.activeMapId,
      mapName: mapSpec.name,
      health: this.health.health,
      maxHealth: this.health.maxHealth,
      stamina: this.health.stamina,
      maxStamina: this.health.maxStamina,
      isCrouching: this.movement.isCrouching,
      isSprinting: this.movement.isSprinting,
      isAiming: this.isAiming,
      cameraMode: this.cameraCtrl.mode,
      playerX: this.movement.position.x,
      playerY: playerFeetY,
      playerZ: this.movement.position.z,
      playerYawDeg: yawDeg,
      currentZone,
      zoneName: mapSpec.zoneNames[currentZone],
      aliveCount: this.countAliveBots() + (this.health.eliminated ? 0 : 1),
      totalCombatants: TOTAL_COMBATANTS,
      kills: this.kills,
      damageDealt: this.damageDealt,
      equipped: { ...this.inventory.equipped },
      inventory: this.inventory.items.map((i) => ({ ...i })),
      safeZone: this.safeZone.getSnapshot(this.movement.position.x, this.movement.position.z),
      lootPrompt: isTouch
        ? lootMatch?.prompt ?? null
        : desktopPreferDoor
          ? null
          : lootMatch?.prompt ?? null,
      doorPrompt: isTouch
        ? doorMatch?.prompt ?? null
        : desktopPreferDoor
          ? doorMatch?.prompt ?? null
          : null,
      vehiclePrompt,
      activeVehicle: activeVeh
        ? this.vehicles.getHudState(activeVeh, this.cameraCtrl.drivingZoomIndex)
        : null,
      healing: this.health.getHealingState(),
      reloading: this.reloadTimer
        ? {
            weaponName: this.reloadTimer.weaponName,
            progress: Math.min(1, this.reloadTimer.elapsed / this.reloadTimer.total),
          }
        : null,
      hitMarkerAlpha: this.hitMarkerAlpha,
      hitMarkerKill: this.hitMarkerKill,
      damageFlashAlpha: this.damageFlashAlpha,
      killFeed: [...this.killFeed],
      minimapBlips: blips,
      fps: this.loop ? this.loop.currentFps : 60,
      pointerLocked: this.input.isPointerLocked(),
      inputMode: this.input.getResolvedMode(),
      inputModeSetting: this.input.getModeSetting(),
      difficulty: this.settings.difficulty,
      deviceCapabilities: this.input.getCapabilities(),
      ammoReserves: { ...this.inventory.ammoReserves },
    });
  }

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.cameraCtrl.setAspect(w / h);
    this.renderer.setSize(w, h);
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.onContextIssue(true);
  };

  private onContextRestored = (): void => {
    this.onContextIssue(false);
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    this.loop?.stop();

    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.input.dispose();
    this.audio.dispose();
    this.map?.dispose();
    this.inventory?.dispose();
    this.safeZone?.dispose();
    this.combat?.dispose();
    this.vehicles.dispose(this.physics);
    this.clearBotRigs();
    this.avatar?.dispose();
    this.weaponFactory?.dispose();
    this.characterAppearance?.dispose();
    this.characterLoader.dispose();
    this.materials?.dispose();
    this.envRT?.dispose();
    this.physics.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
