import * as THREE from 'three';
import {
  EquippedState,
  InventoryItem,
  LootPrompt,
  WeaponSpec,
} from '../types/game';
import { MaterialLibrary } from '../world/Materials';
import { SpawnPoint } from '../world/Map';

export const WEAPON_CATALOG: Record<string, WeaponSpec> = {
  vx47: {
    id: 'vx47',
    name: 'VX-47 Carbine',
    slot: 'primary',
    ammoType: '5.56mm',
    damage: 22,
    fireRate: 9.0,
    magSize: 30,
    reloadTime: 1.75,
    spread: 0.016,
    pellets: 1,
    range: 185,
    recoil: 0.022,
    automatic: true,
    adsFovDelta: -14,
    colorHex: 0x3b444b,
  },
  mr12: {
    id: 'mr12',
    name: 'MR-12 Marksman',
    slot: 'primary',
    ammoType: '7.62mm',
    damage: 48,
    fireRate: 2.6,
    magSize: 10,
    reloadTime: 2.1,
    spread: 0.005,
    pellets: 1,
    range: 240,
    recoil: 0.045,
    automatic: false,
    adsFovDelta: -26,
    colorHex: 0x4f5646,
  },
  sg8: {
    id: 'sg8',
    name: 'SG-8 Breacher',
    slot: 'primary',
    ammoType: '12G',
    damage: 14,
    fireRate: 1.3,
    magSize: 6,
    reloadTime: 2.2,
    spread: 0.068,
    pellets: 6,
    range: 62,
    recoil: 0.065,
    automatic: false,
    adsFovDelta: -8,
    colorHex: 0x2f343a,
  },
  p9: {
    id: 'p9',
    name: 'P-9 Tactical',
    slot: 'secondary',
    ammoType: '9mm',
    damage: 18,
    fireRate: 5.5,
    magSize: 15,
    reloadTime: 1.25,
    spread: 0.02,
    pellets: 1,
    range: 115,
    recoil: 0.018,
    automatic: false,
    adsFovDelta: -10,
    colorHex: 0x252a30,
  },
};

export interface LootNode {
  uid: string;
  item: InventoryItem;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Group;
}

let uidSeq = 1;
function nextUid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${uidSeq}`;
}

export class InventorySystem {
  public readonly lootGroup = new THREE.Group();
  public readonly lootNodes: LootNode[] = [];
  public items: InventoryItem[] = [];
  public readonly maxBackpackSlots = 12;

  public equipped: EquippedState = {
    primary: null,
    secondary: WEAPON_CATALOG.p9,
    activeSlot: 'secondary',
    primaryAmmoInMag: 0,
    secondaryAmmoInMag: 15,
    vestDurability: 0,
    vestMax: 100,
    helmetDurability: 0,
    helmetMax: 70,
  };

  public ammoReserves: Record<string, number> = {
    '5.56mm': 30,
    '7.62mm': 0,
    '12G': 0,
    '9mm': 30,
  };

  private crateGeoBase: THREE.BoxGeometry;
  private crateGeoLid: THREE.BoxGeometry;
  private crateGeoTrim: THREE.BoxGeometry;

  constructor(private materials: MaterialLibrary) {
    this.crateGeoBase = new THREE.BoxGeometry(0.68, 0.34, 0.48);
    this.crateGeoLid = new THREE.BoxGeometry(0.72, 0.09, 0.52);
    this.crateGeoTrim = new THREE.BoxGeometry(0.74, 0.06, 0.12);
    this.resetStarterLoadout();
  }

  public resetStarterLoadout(): void {
    this.clearWorldLoot();
    this.items = [
      {
        uid: nextUid('med'),
        id: 'bandage',
        name: 'Field Bandage',
        category: 'medical',
        quantity: 2,
        description: 'Restores 25 HP over 2.2s',
        healAmount: 25,
        useTime: 2.2,
      },
    ];
    this.equipped = {
      primary: null,
      secondary: WEAPON_CATALOG.p9,
      activeSlot: 'secondary',
      primaryAmmoInMag: 0,
      secondaryAmmoInMag: WEAPON_CATALOG.p9.magSize,
      vestDurability: 0,
      vestMax: 100,
      helmetDurability: 0,
      helmetMax: 70,
    };
    this.ammoReserves = {
      '5.56mm': 30,
      '7.62mm': 10,
      '12G': 8,
      '9mm': 30,
    };
  }

  public populateWorldLoot(locations: SpawnPoint[]): void {
    this.clearWorldLoot();

    const pool: Array<() => InventoryItem> = [
      () => ({
        uid: nextUid('wpn'),
        id: 'vx47',
        name: WEAPON_CATALOG.vx47.name,
        category: 'primary',
        quantity: 1,
        description: '5.56mm automatic carbine',
        weaponSpec: WEAPON_CATALOG.vx47,
      }),
      () => ({
        uid: nextUid('wpn'),
        id: 'mr12',
        name: WEAPON_CATALOG.mr12.name,
        category: 'primary',
        quantity: 1,
        description: '7.62mm precision marksman rifle',
        weaponSpec: WEAPON_CATALOG.mr12,
      }),
      () => ({
        uid: nextUid('wpn'),
        id: 'sg8',
        name: WEAPON_CATALOG.sg8.name,
        category: 'primary',
        quantity: 1,
        description: '12G tactical pump shotgun',
        weaponSpec: WEAPON_CATALOG.sg8,
      }),
      () => ({
        uid: nextUid('arm'),
        id: 'vest',
        name: 'Ballistic Vest',
        category: 'armor',
        quantity: 1,
        description: 'Absorbs 40% torso damage (100 durability)',
        armorSlot: 'vest',
        armorDurability: 100,
        armorMitigation: 0.4,
      }),
      () => ({
        uid: nextUid('arm'),
        id: 'helmet',
        name: 'Composite Helmet',
        category: 'armor',
        quantity: 1,
        description: 'Absorbs 45% head damage (70 durability)',
        armorSlot: 'helmet',
        armorDurability: 70,
        armorMitigation: 0.45,
      }),
      () => ({
        uid: nextUid('med'),
        id: 'medkit',
        name: 'Tactical Medkit',
        category: 'medical',
        quantity: 1,
        description: 'Restores 65 HP over 4.0s',
        healAmount: 65,
        useTime: 4.0,
      }),
      () => ({
        uid: nextUid('med'),
        id: 'bandage',
        name: 'Field Bandage',
        category: 'medical',
        quantity: 2,
        description: 'Restores 25 HP over 2.2s',
        healAmount: 25,
        useTime: 2.2,
      }),
      () => ({
        uid: nextUid('amo'),
        id: 'ammo_556',
        name: '5.56mm Ammo Pack',
        category: 'ammo',
        quantity: 30,
        description: '30 rounds for VX-47 Carbine',
      }),
      () => ({
        uid: nextUid('amo'),
        id: 'ammo_762',
        name: '7.62mm Ammo Pack',
        category: 'ammo',
        quantity: 20,
        description: '20 rounds for MR-12 Marksman',
      }),
    ];

    locations.forEach((loc, idx) => {
      const factory = pool[idx % pool.length];
      this.spawnWorldLoot(factory(), loc.x, loc.y, loc.z);
    });
  }

  public spawnWorldLoot(item: InventoryItem, x: number, y: number, z: number): void {
    const grp = new THREE.Group();
    grp.position.set(x, y + 0.05, z);

    const base = new THREE.Mesh(this.crateGeoBase, this.materials.lootCrateBody);
    base.position.y = 0.17;
    base.castShadow = true;
    base.receiveShadow = true;

    const lid = new THREE.Mesh(this.crateGeoLid, this.materials.concreteDark);
    lid.position.y = 0.38;
    lid.castShadow = true;

    const isMedicalOrArmor = item.category === 'medical' || item.category === 'armor';
    const trim = new THREE.Mesh(
      this.crateGeoTrim,
      isMedicalOrArmor ? this.materials.lootTrimEmerald : this.materials.lootTrimAmber,
    );
    trim.position.y = 0.43;

    grp.add(base, lid, trim);
    this.lootGroup.add(grp);

    this.lootNodes.push({
      uid: item.uid,
      item,
      x,
      y,
      z,
      mesh: grp,
    });
  }

  public updateLootVisuals(elapsed: number): void {
    for (let i = 0; i < this.lootNodes.length; i++) {
      const node = this.lootNodes[i];
      node.mesh.rotation.y = elapsed * 0.75 + i;
      node.mesh.position.y = node.y + 0.08 + Math.sin(elapsed * 2.2 + i) * 0.04;
    }
  }

  public findNearestLootWithDistance(
    px: number,
    py: number,
    pz: number,
    maxRange = 3.2,
  ): { prompt: LootPrompt; distSq: number } | null {
    let best: LootNode | null = null;
    let bestDistSq = maxRange * maxRange;
    for (const node of this.lootNodes) {
      const dx = node.x - px;
      const dy = node.y - py;
      const dz = node.z - pz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = node;
      }
    }
    if (!best) return null;
    return {
      prompt: {
        uid: best.uid,
        name: best.item.name,
        category: best.item.category,
        quantity: best.item.quantity,
      },
      distSq: bestDistSq,
    };
  }

  public findNearestLoot(px: number, py: number, pz: number, maxRange = 3.2): LootPrompt | null {
    return this.findNearestLootWithDistance(px, py, pz, maxRange)?.prompt ?? null;
  }

  public pickupNearestLoot(px: number, py: number, pz: number, maxRange = 3.2): InventoryItem | null {
    let bestIdx = -1;
    let bestDistSq = maxRange * maxRange;
    for (let i = 0; i < this.lootNodes.length; i++) {
      const n = this.lootNodes[i];
      const dSq = (n.x - px) ** 2 + (n.y - py) ** 2 + (n.z - pz) ** 2;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) return null;

    const node = this.lootNodes[bestIdx];
    const picked = node.item;

    const accepted = this.collectItem(picked, px, py, pz);
    if (!accepted) return null;

    this.lootGroup.remove(node.mesh);
    this.lootNodes.splice(bestIdx, 1);
    return picked;
  }

  private collectItem(item: InventoryItem, dropX: number, dropY: number, dropZ: number): boolean {
    if (item.category === 'ammo') {
      const ammoKey =
        item.id === 'ammo_556'
          ? '5.56mm'
          : item.id === 'ammo_762'
            ? '7.62mm'
            : item.id === 'ammo_12g'
              ? '12G'
              : '9mm';
      this.ammoReserves[ammoKey] = (this.ammoReserves[ammoKey] ?? 0) + item.quantity;
      return true;
    }

    if (item.category === 'armor') {
      if (item.armorSlot === 'vest' && this.equipped.vestDurability < (item.armorDurability ?? 100)) {
        this.equipped.vestDurability = item.armorDurability ?? 100;
        return true;
      }
      if (item.armorSlot === 'helmet' && this.equipped.helmetDurability < (item.armorDurability ?? 70)) {
        this.equipped.helmetDurability = item.armorDurability ?? 70;
        return true;
      }
    }

    if (item.category === 'primary' && item.weaponSpec) {
      if (!this.equipped.primary) {
        this.equipped.primary = item.weaponSpec;
        this.equipped.primaryAmmoInMag = item.weaponSpec.magSize;
        this.equipped.activeSlot = 'primary';
        this.ammoReserves[item.weaponSpec.ammoType] =
          (this.ammoReserves[item.weaponSpec.ammoType] ?? 0) + item.weaponSpec.magSize;
        return true;
      }
      // Swap into backpack or swap active primary if backpack full
      if (this.items.length < this.maxBackpackSlots) {
        this.items.push(item);
        return true;
      }
      return false;
    }

    // Stack medical items by id
    if (item.category === 'medical') {
      const existing = this.items.find((i) => i.id === item.id);
      if (existing) {
        existing.quantity += item.quantity;
        return true;
      }
    }

    if (this.items.length >= this.maxBackpackSlots) {
      return false;
    }
    void dropX;
    void dropY;
    void dropZ;
    this.items.push(item);
    return true;
  }

  public getActiveWeapon(): WeaponSpec | null {
    return this.equipped.activeSlot === 'primary'
      ? this.equipped.primary
      : this.equipped.secondary;
  }

  public getActiveMagAmmo(): number {
    return this.equipped.activeSlot === 'primary'
      ? this.equipped.primaryAmmoInMag
      : this.equipped.secondaryAmmoInMag;
  }

  public consumeActiveAmmo(): boolean {
    if (this.equipped.activeSlot === 'primary') {
      if (this.equipped.primaryAmmoInMag <= 0) return false;
      this.equipped.primaryAmmoInMag -= 1;
      return true;
    }
    if (this.equipped.secondaryAmmoInMag <= 0) return false;
    this.equipped.secondaryAmmoInMag -= 1;
    return true;
  }

  public canReloadActive(): boolean {
    const wpn = this.getActiveWeapon();
    if (!wpn) return false;
    const inMag = this.getActiveMagAmmo();
    if (inMag >= wpn.magSize) return false;
    return (this.ammoReserves[wpn.ammoType] ?? 0) > 0;
  }

  public completeReloadActive(): void {
    const wpn = this.getActiveWeapon();
    if (!wpn) return;
    const inMag = this.getActiveMagAmmo();
    const reserve = this.ammoReserves[wpn.ammoType] ?? 0;
    const needed = wpn.magSize - inMag;
    const taken = Math.min(needed, reserve);
    if (taken <= 0) return;

    this.ammoReserves[wpn.ammoType] = reserve - taken;
    if (this.equipped.activeSlot === 'primary') {
      this.equipped.primaryAmmoInMag += taken;
    } else {
      this.equipped.secondaryAmmoInMag += taken;
    }
  }

  public switchSlot(slot: 'primary' | 'secondary'): void {
    if (slot === 'primary' && !this.equipped.primary) return;
    if (slot === 'secondary' && !this.equipped.secondary) return;
    this.equipped.activeSlot = slot;
  }

  public equipItemFromBackpack(uid: string): void {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.items[idx];

    if (item.category === 'primary' && item.weaponSpec) {
      const oldPrimary = this.equipped.primary;
      this.equipped.primary = item.weaponSpec;
      this.equipped.primaryAmmoInMag = item.weaponSpec.magSize;
      this.equipped.activeSlot = 'primary';
      this.items.splice(idx, 1);
      if (oldPrimary) {
        this.items.push({
          uid: nextUid('wpn'),
          id: oldPrimary.id,
          name: oldPrimary.name,
          category: 'primary',
          quantity: 1,
          description: `${oldPrimary.ammoType} tactical firearm`,
          weaponSpec: oldPrimary,
        });
      }
      return;
    }

    if (item.category === 'armor') {
      if (item.armorSlot === 'vest') {
        this.equipped.vestDurability = item.armorDurability ?? 100;
        this.items.splice(idx, 1);
      } else if (item.armorSlot === 'helmet') {
        this.equipped.helmetDurability = item.armorDurability ?? 70;
        this.items.splice(idx, 1);
      }
    }
  }

  public consumeMedicalItem(uid?: string): InventoryItem | null {
    const idx = uid
      ? this.items.findIndex((i) => i.uid === uid && i.category === 'medical')
      : this.items.findIndex((i) => i.category === 'medical');
    if (idx === -1) return null;
    const item = this.items[idx];
    const snapshot = { ...item };
    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      this.items.splice(idx, 1);
    }
    return snapshot;
  }

  public findBestMedicalItem(): InventoryItem | null {
    return (
      this.items.find((i) => i.id === 'medkit') ??
      this.items.find((i) => i.category === 'medical') ??
      null
    );
  }

  public dropItem(uid: string, px: number, py: number, pz: number): void {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const [removed] = this.items.splice(idx, 1);
    this.spawnWorldLoot(removed, px + 0.8, py, pz + 0.8);
  }

  public clearWorldLoot(): void {
    for (const node of this.lootNodes) {
      this.lootGroup.remove(node.mesh);
    }
    this.lootNodes.length = 0;
  }

  public dispose(): void {
    this.clearWorldLoot();
    this.crateGeoBase.dispose();
    this.crateGeoLid.dispose();
    this.crateGeoTrim.dispose();
  }
}
