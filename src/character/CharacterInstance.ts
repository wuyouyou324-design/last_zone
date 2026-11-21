import * as THREE from 'three';
import { WeaponModelsFactory } from '../weapons/WeaponModels';
import { CharacterAnimator } from './CharacterAnimator';
import { CharacterAppearanceLibrary } from './CharacterAppearance';
import { CharacterEquipment } from './CharacterEquipment';
import { CharacterLODController } from './CharacterLOD';
import type { CharacterAssetBundle } from './CharacterLoader';
import type {
  CharacterAppearanceConfig,
  CharacterEquipmentConfig,
  CharacterMotionState,
} from './CharacterTypes';

const _actorPos = new THREE.Vector3();

export class CharacterInstance {
  public readonly root: THREE.Group;
  public readonly animator: CharacterAnimator;
  public readonly equipment: CharacterEquipment;
  public readonly lod: CharacterLODController;

  private lod0Meshes: THREE.Object3D[] = [];
  private lod1Meshes: THREE.Object3D[] = [];
  private lod1Skeletons: THREE.Skeleton[] = [];
  private appearanceConfig: CharacterAppearanceConfig;

  constructor(
    bundle: CharacterAssetBundle,
    loaderInstantiator: (tpl: CharacterAssetBundle['lod0']) => THREE.Group,
    appearanceLib: CharacterAppearanceLibrary,
    weaponFactory: WeaponModelsFactory,
    appearance: CharacterAppearanceConfig,
    options?: {
      isPlayer?: boolean;
      lod0Dist?: number;
      cullDist?: number;
    },
  ) {
    this.appearanceConfig = {
      ...appearance,
      equipment: { ...appearance.equipment },
    };
    this.root = loaderInstantiator(bundle.lod0);

    // Map LOD0 bones by name so LOD1 SkinnedMeshes bind onto the single shared skeleton
    const boneByName = new Map<string, THREE.Bone>();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Bone) {
        boneByName.set(obj.name, obj);
      } else if (obj instanceof THREE.SkinnedMesh) {
        this.lod0Meshes.push(obj);
      }
    });

    // Instantiate LOD1 meshes and rebind to LOD0's skeleton hierarchy
    const lod1Temp = loaderInstantiator(bundle.lod1);
    const lod1ToAttach: THREE.SkinnedMesh[] = [];
    lod1Temp.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) {
        const mappedBones = obj.skeleton.bones.map(
          (b) => boneByName.get(b.name) ?? b,
        );
        const reboundSkeleton = new THREE.Skeleton(
          mappedBones,
          obj.skeleton.boneInverses,
        );
        obj.bind(reboundSkeleton, obj.bindMatrix);
        this.lod1Skeletons.push(reboundSkeleton);
        lod1ToAttach.push(obj);
      }
    });

    for (const m of lod1ToAttach) {
      this.root.add(m);
      this.lod1Meshes.push(m);
    }

    appearanceLib.applyToRig(this.root, appearance);

    this.equipment = new CharacterEquipment(this.root, weaponFactory, true);
    this.animator = new CharacterAnimator(this.root, bundle.lod0.animations);
    this.lod = new CharacterLODController(
      options?.lod0Dist ?? (options?.isPlayer ? 200 : 34),
      options?.cullDist ?? (options?.isPlayer ? 500 : 120),
    );
    this.lod.registerMeshes(this.lod0Meshes, this.lod1Meshes);
    this.applyEquipmentConfig(appearance.equipment);
  }

  public applyEquipmentConfig(config: CharacterEquipmentConfig): void {
    this.root.traverse((obj) => {
      if (!(obj instanceof THREE.SkinnedMesh)) return;
      if (obj.name === 'Gear_Helmet') obj.visible = config.helmet;
      else if (obj.name === 'Gear_Goggles') obj.visible = config.goggles;
      else if (obj.name === 'Gear_Balaclava') obj.visible = config.balaclava;
      else if (obj.name === 'Gear_Vest') obj.visible = config.vest;
      else if (obj.name === 'Gear_Backpack') obj.visible = config.backpack;
    });
    const currentLod = this.lod?.currentLod ?? 0;
    const show0 = currentLod === 0;
    const show1 = currentLod === 1;
    for (const m of this.lod0Meshes) {
      if (!show0) m.visible = false;
    }
    for (const m of this.lod1Meshes) {
      if (!show1) m.visible = false;
    }
  }

  public update(
    dt: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    motion: CharacterMotionState,
    cameraPos: THREE.Vector3,
    forceFullDetail = false,
  ): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.equipment.setActiveWeapon(motion.weaponId);

    _actorPos.set(x, y, z);
    const animDt = this.lod.evaluate(dt, _actorPos, cameraPos, forceFullDetail);
    if (this.lod.currentLod !== 2) {
      this.syncEquipmentAfterLod();
    }

    if (animDt > 0 || motion.isEliminated) {
      this.animator.update(animDt > 0 ? animDt : dt, motion);
    }
  }

  private syncEquipmentAfterLod(): void {
    const eq = this.appearanceConfig.equipment;
    const activeMeshes = this.lod.currentLod === 0 ? this.lod0Meshes : this.lod1Meshes;
    for (const m of activeMeshes) {
      if (m.name === 'Gear_Helmet') m.visible = eq.helmet;
      else if (m.name === 'Gear_Goggles') m.visible = eq.goggles;
      else if (m.name === 'Gear_Balaclava') m.visible = eq.balaclava;
      else if (m.name === 'Gear_Vest') m.visible = eq.vest;
      else if (m.name === 'Gear_Backpack') m.visible = eq.backpack;
    }
  }

  public setEquipmentState(partial: Partial<CharacterEquipmentConfig>): void {
    this.appearanceConfig = {
      ...this.appearanceConfig,
      equipment: {
        ...this.appearanceConfig.equipment,
        ...partial,
      },
    };
    this.applyEquipmentConfig(this.appearanceConfig.equipment);
  }

  public dispose(): void {
    this.animator.dispose();
    this.equipment.dispose();
    this.lod1Skeletons.forEach((s) => s.dispose());
    this.lod1Skeletons = [];
    this.lod0Meshes = [];
    this.lod1Meshes = [];
  }
}
