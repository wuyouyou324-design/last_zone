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
import { CameraController } from '../player/Camera';
import { MovementController, MovementInput } from '../player/Movement';
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

  private input: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jump: false,
  };
  private isFiring = false;
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
  private pointerLocked = false;
  private pointerLockPending = false;
  private pointerLockRejected = false;
  private lastPointerLockExitAt = 0;
  private lastPointerLockReqAt = 0;
  private disposed = false;
  private ready = false;
  private menuOrbitAngle = 0.4;

  constructor(
    private container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: {
      onHudUpdate: (snap: HudSnapshot) => void;
      onMatchEnd: (summary: MatchSummary) => void;
      onContextIssue: (lost: boolean) => void;
      onReady: () => void;
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

    this.setupLightingAndEnvironment();
    this.bindEvents();

    void this.initAsync(callbacks.onReady);
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

  private async initAsync(onReady: () => void): Promise<void> {
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

    this.avatar = new PlayerAvatar(
      this.characterBundle,
      this.characterLoader,
      this.characterAppearance,
      this.weaponFactory,
    );
    this.scene.add(this.avatar.bodyGroup);
    this.cameraCtrl.camera.add(this.avatar.viewmodelGroup);

    this.physics.createPlayerController(0, this.map.getHeightAt(0, 0) + 1.1, 0);
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
  }

  public selectMap(mapId: MapId): void {
    if (!this.ready || this.disposed || this.activeMapId === mapId) return;
    this.activeMapId = mapId;

    this.clearBotRigs();
    this.ai.bots = [];
    this.inventory.clearWorldLoot();

    if (this.map) {
      this.scene.remove(this.map.root);
      this.map.dispose();
    }

    this.physics.resetWorld();
    this.map = new IslandMap(this.materials, this.physics, mapId);
    this.scene.add(this.map.root);
    this.physics.createPlayerController(0, this.map.getHeightAt(0, 0) + 1.1, 0);

    this.applyMapAtmosphere(mapId);
    this.map.environment.applyQuality(this.settings.quality);
    this.emitHudSnapshot();
  }

  public getMinimapCanvas(): HTMLCanvasElement | null {
    return this.map ? this.map.minimapCanvas : null;
  }

  public startNewMatch(): void {
    if (!this.ready) return;
    this.audio.unlock();

    this.health.reset();
    this.inventory.resetStarterLoadout();
    this.inventory.populateWorldLoot(this.map.generateLootLocations());
    this.safeZone.reset();

    // Clear old bot rigs
    this.clearBotRigs();
    this.ai.bots = [];
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
    this.isAiming = false;

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
    if (next !== 'playing') {
      this.isFiring = false;
      this.isAiming = false;
      this.clearMovementInputs();
      if (document.pointerLockElement === this.renderer.domElement) {
        this.lastPointerLockExitAt = performance.now();
        try {
          document.exitPointerLock();
        } catch {
          // Ignore exitPointerLock errors
        }
      }
    }
    this.emitHudSnapshot();
  }

  public resumePlaying(): void {
    if (this.health.eliminated) return;
    this.audio.unlock();
    this.setScreen('playing');
    this.requestPointerLock();
  }

  public requestPointerLock(): void {
    const canvas = this.renderer.domElement;
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
    if (document.pointerLockElement === canvas || this.pointerLockPending) return;

    const now = performance.now();
    // Debounce re-locking right after exit/rejection to avoid Chromium Blink>Input>PointerLock UnknownError
    if (now - this.lastPointerLockExitAt < 200 || now - this.lastPointerLockReqAt < 200) {
      return;
    }

    this.lastPointerLockReqAt = now;
    this.pointerLockPending = true;
    try {
      const maybePromise = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          () => {
            this.pointerLockPending = false;
            this.pointerLockRejected = false;
          },
          () => {
            this.pointerLockPending = false;
            this.pointerLockRejected = true;
          },
        );
      } else {
        this.pointerLockPending = false;
      }
    } catch {
      this.pointerLockPending = false;
      this.pointerLockRejected = true;
    }
  }

  public applySettings(next: GameSettings): void {
    this.settings = { ...next };
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
    this.cameraCtrl.toggleMode();
    this.emitHudSnapshot();
  }

  private update(dt: number, elapsed: number): void {
    if (!this.ready || this.disposed) return;

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

      // 1. Player Physics & Movement
      const activeInput =
        this.screen === 'playing'
          ? this.input
          : {
              forward: false,
              backward: false,
              left: false,
              right: false,
              sprint: false,
              crouch: this.input.crouch,
              jump: false,
            };

      const mapHeightAt = (x: number, z: number) => this.map.getHeightAt(x, z);
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

      // 2. Healing & Reloading timers
      if (this.health.isHealing()) {
        if (this.movement.isSprinting || this.isFiring) {
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

      // 3. Automatic / Continuous Player Firing
      if (this.screen === 'playing' && this.isFiring) {
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

      // 5. Loot hover animation
      this.inventory.updateLootVisuals(elapsed);

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
        },
        this.safeZone,
        this.physics,
        this.map.getObstacles(),
        (ev) => this.handleBotFire(ev),
        (bot) => this.handleBotEliminated(bot, 'Safe Zone', 'Storm'),
        mapHeightAt,
      );

      this.syncBotVisuals(dt);

      // 7. Combat tracer/impact VFX
      this.combat.update(dt);

      // 8. Player Camera & Avatar
      const activeWeapon = this.inventory.getActiveWeapon();
      const adsDelta = activeWeapon ? activeWeapon.adsFovDelta : -10;
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
      if (!out.hitTargetId) continue;
      const bot = this.ai.bots.find((b) => b.id === out.hitTargetId);
      if (!bot || bot.state === 'Eliminated') continue;

      const res = this.ai.applyDamageToBot(bot, out.damage);
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

    _botOrigin.set(ev.bot.x, ev.bot.y + 1.45, ev.bot.z);
    const botRig = this.botRigs.get(ev.bot.id);
    if (!botRig || !botRig.character.equipment.getWeaponMuzzleWorld(_botMuzzle)) {
      _botMuzzle.set(ev.bot.x, ev.bot.y + 1.32, ev.bot.z);
    }
    _botDir
      .set(ev.target.x - ev.bot.x, ev.target.y + 1.2 - (ev.bot.y + 1.45), ev.target.z - ev.bot.z)
      .normalize();

    this.combat.fireWeaponRay(_botOrigin, _botDir, _botMuzzle, ev.bot.weapon, [], 1.2);

    if (!ev.hit) return;

    if (ev.target.id === 'player') {
      this.health.applyDamage(ev.damage, ev.isHeadshot, this.inventory.equipped, false);
      this.damageFlashAlpha = 0.85;
      this.audio.playDamageTaken();
      this.avatar.triggerHitReaction();
      if (this.health.eliminated) {
        this.handlePlayerEliminated(`${ev.bot.name} (${ev.bot.weapon.name})`);
      }
    } else {
      const targetBot = this.ai.bots.find((b) => b.id === ev.target.id);
      if (targetBot && targetBot.state !== 'Eliminated') {
        const res = this.ai.applyDamageToBot(targetBot, ev.damage);
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
    this.avatar.triggerElimination();
    this.pushKillFeed(by, 'You', '');
    this.finishMatch(false);
  }

  private finishMatch(victory: boolean): void {
    if (this.screen === 'results') return;
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

  private emitHudSnapshot(): void {
    if (!this.ready) return;
    const playerFeetY = this.movement.getFeetY();
    const yawDeg = (((-this.cameraCtrl.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const blips: MinimapBlip[] = this.gunfireBlips.map((b) => ({
      x: b.x,
      z: b.z,
      kind: 'gunfire',
      alpha: Math.min(1, b.timeLeft / 2.2),
    }));

    const currentZone = this.map.getZoneAt(this.movement.position.x, this.movement.position.z);
    const mapSpec = MAP_CATALOG[this.activeMapId];

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
      lootPrompt: this.inventory.findNearestLoot(
        this.movement.position.x,
        playerFeetY,
        this.movement.position.z,
      ),
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
      pointerLocked: this.pointerLocked,
      ammoReserves: { ...this.inventory.ammoReserves },
    });
  }

  private clearMovementInputs(): void {
    this.input.forward = false;
    this.input.backward = false;
    this.input.left = false;
    this.input.right = false;
    this.input.sprint = false;
    this.input.jump = false;
  }

  // Event Handlers
  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.cameraCtrl.setAspect(w / h);
    this.renderer.setSize(w, h);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Tab' || e.code === 'KeyI') {
      if (this.screen === 'playing') {
        e.preventDefault();
        this.setScreen('inventory');
      } else if (this.screen === 'inventory') {
        e.preventDefault();
        this.resumePlaying();
      }
      return;
    }

    if (e.code === 'Escape') {
      if (this.screen === 'playing' || this.screen === 'inventory') {
        this.setScreen('paused');
      } else if (this.screen === 'paused') {
        this.resumePlaying();
      }
      return;
    }

    if (this.screen !== 'playing') return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.input.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.input.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.input.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.input.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.sprint = true;
        break;
      case 'Space':
        this.input.jump = true;
        break;
      case 'KeyC':
        if (!e.repeat) {
          this.input.crouch = !this.input.crouch;
        }
        break;
      case 'KeyV':
        if (!e.repeat) {
          this.toggleCameraMode();
        }
        break;
      case 'KeyF':
        if (!e.repeat) {
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
        break;
      case 'KeyR':
        if (!e.repeat) {
          this.startReload();
        }
        break;
      case 'Digit1':
        this.switchWeaponSlot('primary');
        break;
      case 'Digit2':
        this.switchWeaponSlot('secondary');
        break;
      case 'Digit3':
        if (!e.repeat) {
          const med = this.inventory.findBestMedicalItem();
          if (med) this.useMedicalItem(med.uid);
        }
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.input.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.input.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.input.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.input.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.sprint = false;
        break;
      case 'Space':
        this.input.jump = false;
        break;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.screen !== 'playing') return;
    const fallbackDragLook = !this.pointerLocked && this.pointerLockRejected && (e.buttons & 2) !== 0;
    if (!this.pointerLocked && !fallbackDragLook) return;
    this.cameraCtrl.addLookDelta(e.movementX, e.movementY, this.settings.mouseSensitivity);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.screen !== 'playing') return;
    this.audio.unlock();
    if (!this.pointerLocked) {
      this.requestPointerLock();
      if (!this.pointerLockRejected) {
        return;
      }
    }
    if (e.button === 0) {
      this.isFiring = true;
      this.tryPlayerFire();
    } else if (e.button === 2) {
      this.isAiming = true;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.isFiring = false;
    if (e.button === 2) this.isAiming = false;
  };

  private onPointerLockChange = (): void => {
    this.pointerLockPending = false;
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (this.pointerLocked) {
      this.pointerLockRejected = false;
    } else if (wasLocked) {
      this.lastPointerLockExitAt = performance.now();
    }
    if (!this.pointerLocked && this.screen === 'playing') {
      this.isFiring = false;
      this.isAiming = false;
    }
    this.emitHudSnapshot();
  };

  private onPointerLockError = (): void => {
    this.pointerLockPending = false;
    this.pointerLockRejected = true;
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
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
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    this.loop?.stop();

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.audio.dispose();
    this.map?.dispose();
    this.inventory?.dispose();
    this.safeZone?.dispose();
    this.combat?.dispose();
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
