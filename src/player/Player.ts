import * as THREE from 'three';
import { CharacterAppearanceLibrary, PLAYER_APPEARANCE } from '../character/CharacterAppearance';
import { CharacterInstance } from '../character/CharacterInstance';
import { CharacterAssetBundle, CharacterLoader } from '../character/CharacterLoader';
import {
  WEAPON_ASSEMBLY_META,
  WeaponModelId,
  WeaponModelsFactory,
} from '../weapons/WeaponModels';
import { CameraController } from './Camera';
import { MovementController } from './Movement';

const ALL_WEAPON_IDS: WeaponModelId[] = ['vx47', 'mr12', 'sg8', 'p9'];

function toWeaponModelId(id?: string): WeaponModelId {
  if (id === 'vx47' || id === 'mr12' || id === 'sg8' || id === 'p9') return id;
  return 'p9';
}

export class PlayerAvatar {
  public readonly bodyGroup = new THREE.Group();
  public readonly viewmodelGroup = new THREE.Group();
  public readonly character: CharacterInstance;
  private fpArms: THREE.Group;
  private fpLeftArm: THREE.Object3D | null = null;
  private vmWeapons = new Map<WeaponModelId, THREE.Group>();
  private activeWeaponId: WeaponModelId = 'p9';
  private vmRecoilOffset = 0;
  private stridePhase = 0;
  private wasGrounded = true;

  constructor(
    characterBundle: CharacterAssetBundle,
    loader: CharacterLoader,
    appearanceLib: CharacterAppearanceLibrary,
    weaponFactory: WeaponModelsFactory,
  ) {
    this.character = new CharacterInstance(
      characterBundle,
      (tpl) => loader.instantiate(tpl),
      appearanceLib,
      weaponFactory,
      PLAYER_APPEARANCE,
      { isPlayer: true, lod0Dist: 200, cullDist: 500 },
    );
    this.bodyGroup.add(this.character.root);

    // Mount all 4 refined 3D weapons on 1P viewmodel
    for (const id of ALL_WEAPON_IDS) {
      const vm = weaponFactory.createInstance(id, false);
      vm.visible = id === this.activeWeaponId;
      this.viewmodelGroup.add(vm);
      this.vmWeapons.set(id, vm);
    }

    // Load 1P tactical sleeves + gloves viewmodel overlay
    this.fpArms = loader.instantiate(characterBundle.fpArms);
    appearanceLib.applyToRig(this.fpArms, PLAYER_APPEARANCE);
    this.fpLeftArm = this.fpArms.getObjectByName('FP_LeftArmGroup') ?? null;
    this.updateLeftArmForWeapon(this.activeWeaponId);
    this.viewmodelGroup.add(this.fpArms);

    this.bodyGroup.visible = false; // Hidden in 1st-person
    this.viewmodelGroup.position.set(0.23, -0.19, -0.42);
  }

  private updateLeftArmForWeapon(weaponId: WeaponModelId): void {
    if (!this.fpLeftArm) return;
    if (weaponId === 'p9') {
      // Cupping tactical support hand under sidearm grip
      this.fpLeftArm.position.set(0.015, -0.025, 0.165);
      this.fpLeftArm.rotation.set(0.08, -0.22, 0.12);
    } else {
      // Extending forward to support rifle handguard / pump
      this.fpLeftArm.position.set(0.0, 0.0, 0.0);
      this.fpLeftArm.rotation.set(0, 0, 0);
    }
  }

  public setArmorEquipment(hasHelmet: boolean, hasVest: boolean): void {
    this.character.setEquipmentState({
      helmet: hasHelmet,
      vest: hasVest,
    });
  }

  public triggerFireKick(): void {
    this.vmRecoilOffset = 0.055;
  }

  public triggerHitReaction(): void {
    this.character.animator.triggerHitReaction();
  }

  public triggerElimination(): void {
    this.character.animator.triggerElimination();
  }

  public resetVisualState(): void {
    this.character.animator.reset();
    this.wasGrounded = true;
  }

  public getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const meta = WEAPON_ASSEMBLY_META[this.activeWeaponId];
    out.set(0, meta.muzzleY, meta.muzzleZ);
    this.viewmodelGroup.localToWorld(out);
    return out;
  }

  public getThirdPersonMuzzleWorldPosition(out: THREE.Vector3): boolean {
    return this.character.equipment.getWeaponMuzzleWorld(out);
  }

  public updateVisuals(
    dt: number,
    movement: MovementController,
    cameraCtrl: CameraController,
    isAiming: boolean,
    isReloading: boolean,
    weaponId?: string,
    isEliminated = false,
  ): void {
    const nextId = toWeaponModelId(weaponId);
    if (nextId !== this.activeWeaponId) {
      this.activeWeaponId = nextId;
      for (const id of ALL_WEAPON_IDS) {
        const vm = this.vmWeapons.get(id);
        if (vm) vm.visible = id === nextId;
      }
      this.updateLeftArmForWeapon(nextId);
    }

    const isThirdPerson = cameraCtrl.mode === 'third-person';
    this.bodyGroup.visible = isThirdPerson;
    this.viewmodelGroup.visible = !isThirdPerson && !isEliminated;

    const feetY = movement.getFeetY();
    const moveSpeed = movement.isMoving
      ? movement.isSprinting
        ? 8.2
        : movement.isCrouching
          ? 2.8
          : 5.2
      : 0;

    if (movement.isMoving && movement.grounded) {
      this.stridePhase += dt * (movement.isSprinting ? 12 : 8);
    }

    // Update 3P skeletal character & animation mixer (kept warm at full detail in 3P)
    if (isThirdPerson || !this.wasGrounded || !movement.grounded || isEliminated) {
      this.character.update(
        dt,
        movement.position.x,
        feetY,
        movement.position.z,
        cameraCtrl.yaw,
        {
          isMoving: movement.isMoving,
          isSprinting: movement.isSprinting,
          isCrouching: movement.isCrouching,
          isGrounded: movement.grounded,
          isAiming,
          isReloading,
          isEliminated,
          moveSpeed,
          weaponId: this.activeWeaponId,
        },
        cameraCtrl.camera.position,
        true,
      );
    }
    this.wasGrounded = movement.grounded;

    if (!isThirdPerson) {
      this.vmRecoilOffset = THREE.MathUtils.damp(this.vmRecoilOffset, 0, 16, dt);
      const bobX =
        movement.isMoving && movement.grounded ? Math.cos(this.stridePhase * 0.5) * 0.01 : 0;
      const bobY =
        movement.isMoving && movement.grounded ? Math.abs(Math.sin(this.stridePhase)) * 0.012 : 0;

      const meta = WEAPON_ASSEMBLY_META[this.activeWeaponId];
      const targetX = isAiming ? meta.adsOffsetX : 0.23 + bobX;
      const targetY = isReloading ? -0.32 : isAiming ? meta.adsOffsetY : -0.19 - bobY;
      const targetZ = (isAiming ? meta.adsOffsetZ : -0.42) + this.vmRecoilOffset;

      this.viewmodelGroup.position.x = THREE.MathUtils.damp(
        this.viewmodelGroup.position.x,
        targetX,
        16,
        dt,
      );
      this.viewmodelGroup.position.y = THREE.MathUtils.damp(
        this.viewmodelGroup.position.y,
        targetY,
        16,
        dt,
      );
      this.viewmodelGroup.position.z = THREE.MathUtils.damp(
        this.viewmodelGroup.position.z,
        targetZ,
        20,
        dt,
      );
      this.viewmodelGroup.rotation.x = isReloading ? -0.42 : this.vmRecoilOffset * 1.25;
      this.viewmodelGroup.rotation.y = isAiming ? 0 : 0.03;
    }
  }

  public dispose(): void {
    this.vmWeapons.clear();
    this.character.dispose();
  }
}
