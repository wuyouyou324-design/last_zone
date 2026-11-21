import * as THREE from 'three';
import { WEAPON_ASSEMBLY_META, WeaponModelId, WeaponModelsFactory } from '../weapons/WeaponModels';

const ALL_WEAPON_IDS: WeaponModelId[] = ['vx47', 'mr12', 'sg8', 'p9'];

export class CharacterEquipment {
  private rightSocket: THREE.Object3D | null = null;
  private mountedWeapons = new Map<WeaponModelId, THREE.Group>();
  private activeWeaponId: WeaponModelId = 'p9';

  constructor(
    root: THREE.Object3D,
    weaponFactory: WeaponModelsFactory,
    isThirdPerson = true,
  ) {
    this.rightSocket = root.getObjectByName('RightHandWeaponSocket') ?? null;
    if (!this.rightSocket) return;

    for (const id of ALL_WEAPON_IDS) {
      const wpn = weaponFactory.createInstance(id, isThirdPerson);
      wpn.scale.setScalar(1.05);
      // Grip sits right in the operator's right palm; barrel points along socket -Z
      wpn.position.set(0, 0.025, 0.015);
      wpn.visible = id === this.activeWeaponId;
      this.rightSocket.add(wpn);
      this.mountedWeapons.set(id, wpn);
    }
  }

  public setActiveWeapon(weaponId: WeaponModelId): void {
    if (weaponId === this.activeWeaponId) return;
    this.activeWeaponId = weaponId;
    for (const [id, group] of this.mountedWeapons.entries()) {
      group.visible = id === weaponId;
    }
  }

  public getWeaponMuzzleWorld(out: THREE.Vector3): boolean {
    const active = this.mountedWeapons.get(this.activeWeaponId);
    if (!active) return false;
    const meta = WEAPON_ASSEMBLY_META[this.activeWeaponId];
    out.set(0, meta.muzzleY, meta.muzzleZ);
    active.localToWorld(out);
    return true;
  }

  public dispose(): void {
    this.mountedWeapons.clear();
    this.rightSocket = null;
  }
}
