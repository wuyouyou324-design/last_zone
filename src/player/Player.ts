import * as THREE from 'three';
import { MaterialLibrary } from '../world/Materials';
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
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private vmWeapons = new Map<WeaponModelId, THREE.Group>();
  private tpWeapons = new Map<WeaponModelId, THREE.Group>();
  private activeWeaponId: WeaponModelId = 'p9';
  private vmRecoilOffset = 0;
  private stridePhase = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private visorMat: THREE.MeshStandardMaterial;
  private vestMat: THREE.MeshStandardMaterial;

  constructor(materials: MaterialLibrary, weaponFactory: WeaponModelsFactory) {
    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.vestMat = new THREE.MeshStandardMaterial({
      color: 0x3b483d,
      roughness: 0.78,
      metalness: 0.12,
    });

    // Composite 3rd-person player character (bottom-center pivot at feet)
    const legGeo = this.reg(new THREE.BoxGeometry(0.22, 0.78, 0.24));
    legGeo.translate(0, -0.39, 0);
    this.leftLeg = new THREE.Mesh(legGeo, materials.polymerDark);
    this.leftLeg.position.set(-0.15, 0.78, 0);
    this.leftLeg.castShadow = true;

    this.rightLeg = new THREE.Mesh(legGeo, materials.polymerDark);
    this.rightLeg.position.set(0.15, 0.78, 0);
    this.rightLeg.castShadow = true;

    const torso = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.54, 0.66, 0.3)),
      this.vestMat,
    );
    torso.position.set(0, 1.12, 0);
    torso.castShadow = true;

    const rig = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.58, 0.34, 0.34)),
      materials.concreteDark,
    );
    rig.position.set(0, 1.14, 0);

    const head = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.3, 0.32, 0.3)),
      materials.woodPlank,
    );
    head.position.set(0, 1.62, 0);
    head.castShadow = true;

    const helmet = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.35, 0.2, 0.35)),
      materials.gunMetal,
    );
    helmet.position.set(0, 1.72, 0);
    helmet.castShadow = true;

    const visor = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.26, 0.08, 0.06)),
      this.visorMat,
    );
    visor.position.set(0, 1.63, -0.15);

    this.bodyGroup.add(
      this.leftLeg,
      this.rightLeg,
      torso,
      rig,
      head,
      helmet,
      visor,
    );

    // Mount all 4 refined 3D weapons on 3P body & 1P viewmodel (toggled via visibility)
    for (const id of ALL_WEAPON_IDS) {
      const vm = weaponFactory.createInstance(id, false);
      vm.visible = id === this.activeWeaponId;
      this.viewmodelGroup.add(vm);
      this.vmWeapons.set(id, vm);

      const tp = weaponFactory.createInstance(id, true);
      tp.scale.setScalar(1.2);
      tp.position.set(0.36, 1.15, -0.32);
      tp.rotation.set(-0.04, 0.14, 0);
      tp.visible = id === this.activeWeaponId;
      this.bodyGroup.add(tp);
      this.tpWeapons.set(id, tp);
    }

    this.bodyGroup.visible = false; // Hidden in 1st-person
    this.viewmodelGroup.position.set(0.23, -0.19, -0.42);
  }

  private reg<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  public triggerFireKick(): void {
    this.vmRecoilOffset = 0.055;
  }

  public getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const meta = WEAPON_ASSEMBLY_META[this.activeWeaponId];
    out.set(0, meta.muzzleY, meta.muzzleZ);
    this.viewmodelGroup.localToWorld(out);
    return out;
  }

  public updateVisuals(
    dt: number,
    movement: MovementController,
    cameraCtrl: CameraController,
    isAiming: boolean,
    isReloading: boolean,
    weaponId?: string,
  ): void {
    const nextId = toWeaponModelId(weaponId);
    if (nextId !== this.activeWeaponId) {
      this.activeWeaponId = nextId;
      for (const id of ALL_WEAPON_IDS) {
        const vm = this.vmWeapons.get(id);
        if (vm) vm.visible = id === nextId;
        const tp = this.tpWeapons.get(id);
        if (tp) tp.visible = id === nextId;
      }
    }

    const isThirdPerson = cameraCtrl.mode === 'third-person';
    this.bodyGroup.visible = isThirdPerson;
    this.viewmodelGroup.visible = !isThirdPerson;

    const feetY = movement.getFeetY();
    this.bodyGroup.position.set(movement.position.x, feetY, movement.position.z);
    this.bodyGroup.rotation.y = cameraCtrl.yaw;
    this.bodyGroup.scale.y = movement.isCrouching ? 0.72 : 1.0;

    if (movement.isMoving && movement.grounded) {
      this.stridePhase += dt * (movement.isSprinting ? 12 : 8);
      const swing = Math.sin(this.stridePhase) * 0.55;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.damp(this.leftLeg.rotation.x, 0, 12, dt);
      this.rightLeg.rotation.x = THREE.MathUtils.damp(this.rightLeg.rotation.x, 0, 12, dt);
    }

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
    this.tpWeapons.clear();
    this.geometries.forEach((g) => g.dispose());
    this.visorMat.dispose();
    this.vestMat.dispose();
  }
}
