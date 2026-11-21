export type GameScreen = 'menu' | 'playing' | 'paused' | 'inventory' | 'results';

export type CameraMode = 'first-person' | 'third-person';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type MapId = 'emerald_island' | 'arid_canyon' | 'frost_ridge';

export type BiomeZone = 'urban' | 'forest' | 'mountain' | 'industrial';

export type BotState = 'Idle' | 'Explore' | 'Search' | 'Alert' | 'Evade' | 'Eliminated';

export type GameDifficulty = 'easy' | 'normal' | 'hard';

export type AIPersonality = 'aggressive' | 'defensive' | 'opportunistic' | 'cautious';

export type ItemCategory = 'primary' | 'secondary' | 'medical' | 'armor' | 'ammo';

export type InputModeSetting = 'auto' | 'touch' | 'keyboard-mouse';

export type ResolvedInputMode = 'touch' | 'keyboard-mouse';

export interface DeviceCapabilities {
  hasTouch: boolean;
  hasCoarsePointer: boolean;
  hasFinePointer: boolean;
  hasHover: boolean;
  likelyKeyboard: boolean;
  likelyMouse: boolean;
  isHybrid: boolean;
  orientation: 'portrait' | 'landscape';
  viewportWidth: number;
  viewportHeight: number;
}

export interface GameSettings {
  quality: GraphicsQuality;
  shadows: boolean;
  fov: number;
  mouseSensitivity: number;
  touchSensitivity: number;
  masterVolume: number;
  showFps: boolean;
  inputMode: InputModeSetting;
  difficulty: GameDifficulty;
}

export interface WeaponSpec {
  id: string;
  name: string;
  slot: 'primary' | 'secondary';
  ammoType: string;
  damage: number;
  fireRate: number; // shots per second
  magSize: number;
  reloadTime: number; // seconds
  spread: number; // radians
  pellets: number;
  range: number;
  recoil: number;
  automatic: boolean;
  adsFovDelta: number;
  colorHex: number;
}

export interface InventoryItem {
  uid: string;
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  description: string;
  weaponSpec?: WeaponSpec;
  healAmount?: number;
  useTime?: number;
  armorSlot?: 'vest' | 'helmet';
  armorDurability?: number;
  armorMitigation?: number;
}

export interface EquippedState {
  primary: WeaponSpec | null;
  secondary: WeaponSpec | null;
  activeSlot: 'primary' | 'secondary';
  primaryAmmoInMag: number;
  secondaryAmmoInMag: number;
  vestDurability: number;
  vestMax: number;
  helmetDurability: number;
  helmetMax: number;
}

export interface SafeZoneSnapshot {
  phase: number;
  totalPhases: number;
  currentCenterX: number;
  currentCenterZ: number;
  currentRadius: number;
  targetCenterX: number;
  targetCenterZ: number;
  targetRadius: number;
  timeRemaining: number;
  isShrinking: boolean;
  damagePerSecond: number;
  playerOutside: boolean;
}

export interface MinimapBlip {
  x: number;
  z: number;
  kind: 'gunfire' | 'loot';
  alpha: number;
}

export interface KillFeedEntry {
  id: string;
  killer: string;
  victim: string;
  weapon: string;
  timestamp: number;
}

export interface LootPrompt {
  uid: string;
  name: string;
  category: ItemCategory;
  quantity: number;
}

export interface HealingState {
  itemName: string;
  progress: number; // 0..1
  remainingSec: number;
}

export interface ReloadState {
  weaponName: string;
  progress: number; // 0..1
}

export interface HudSnapshot {
  screen: GameScreen;
  mapId: MapId;
  mapName: string;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  isCrouching: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  cameraMode: CameraMode;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYawDeg: number; // 0 = North (-Z)
  currentZone: BiomeZone;
  zoneName: string;
  aliveCount: number;
  totalCombatants: number;
  kills: number;
  damageDealt: number;
  equipped: EquippedState;
  inventory: InventoryItem[];
  safeZone: SafeZoneSnapshot;
  lootPrompt: LootPrompt | null;
  healing: HealingState | null;
  reloading: ReloadState | null;
  hitMarkerAlpha: number;
  hitMarkerKill: boolean;
  damageFlashAlpha: number;
  killFeed: KillFeedEntry[];
  minimapBlips: MinimapBlip[];
  fps: number;
  pointerLocked: boolean;
  inputMode: ResolvedInputMode;
  inputModeSetting: InputModeSetting;
  difficulty: GameDifficulty;
  deviceCapabilities: DeviceCapabilities;
  ammoReserves: Record<string, number>;
}

export interface MatchSummary {
  victory: boolean;
  placement: number;
  totalCombatants: number;
  kills: number;
  damageDealt: number;
  survivalTimeSec: number;
  zoneSurvived: number;
  eliminatedBy: string | null;
}
