import * as THREE from 'three';
import { MaterialLibrary } from '../world/Materials';
import { CameraController } from './Camera';
import { MovementController } from './Movement';

export class PlayerAvatar {
  public readonly bodyGroup = new THREE.Group();
  public readonly viewmodelGroup = new THREE.Group();
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private weaponBarrelVM: THREE.Mesh;
  private weaponBodyVM: THREE.Mesh;
  private vmRecoilOffset = 0;
  private stridePhase = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private visorMat: THREE.MeshStandardMaterial;
  private vestMat: THREE.MeshStandardMaterial;

  constructor(materials: MaterialLibrary) {
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

    // Composite 3rd-person player character (8 parts, bottom-center pivot at feet)
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

    const rifleProp = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.08, 0.12, 0.75)),
      materials.gunMetal,
    );
    rifleProp.position.set(0.28, 1.16, -0.32);

    this.bodyGroup.add(
      this.leftLeg,
      this.rightLeg,
      torso,
      rig,
      head,
      helmet,
      visor,
      rifleProp,
    );
    this.bodyGroup.visible = false; // Hidden in 1st-person

    // Composite 1st-person Weapon Viewmodel (attached to camera)
    this.weaponBodyVM = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.075, 0.11, 0.42)),
      materials.polymerDark,
    );
    this.weaponBarrelVM = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.036, 0.042, 0.36)),
      materials.gunMetal,
    );
    this.weaponBarrelVM.position.set(0, 0.025, -0.32);

    const sightRail = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.04, 0.032, 0.16)),
      materials.gunMetal,
    );
    sightRail.position.set(0, 0.072, -0.02);

    const mag = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.046, 0.14, 0.075)),
      materials.concreteDark,
    );
    mag.position.set(0, -0.1, -0.04);
    mag.rotation.x = 0.16;

    this.viewmodelGroup.add(this.weaponBodyVM, this.weaponBarrelVM, sightRail, mag);
    this.viewmodelGroup.position.set(0.24, -0.22, -0.45);
  }

  private reg<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  public triggerFireKick(): void {
    this.vmRecoilOffset = 0.065;
  }

  public updateVisuals(
    dt: number,
    movement: MovementController,
    cameraCtrl: CameraController,
    isAiming: boolean,
    isReloading: boolean,
    weaponColorHex?: number,
  ): void {
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
      const bobX = movement.isMoving && movement.grounded ? Math.cos(this.stridePhase * 0.5) * 0.012 : 0;
      const bobY = movement.isMoving && movement.grounded ? Math.abs(Math.sin(this.stridePhase)) * 0.014 : 0;

      const targetX = isAiming ? 0.0 : 0.24 + bobX;
      const targetY = isReloading ? -0.34 : isAiming ? -0.155 : -0.22 - bobY;
      const targetZ = (isAiming ? -0.36 : -0.45) + this.vmRecoilOffset;

      this.viewmodelGroup.position.x = THREE.MathUtils.damp(this.viewmodelGroup.position.x, targetX, 16, dt);
      this.viewmodelGroup.position.y = THREE.MathUtils.damp(this.viewmodelGroup.position.y, targetY, 16, dt);
      this.viewmodelGroup.position.z = THREE.MathUtils.damp(this.viewmodelGroup.position.z, targetZ, 20, dt);
      this.viewmodelGroup.rotation.x = isReloading ? -0.45 : this.vmRecoilOffset * 1.4;
      if (weaponColorHex !== undefined) {
        this.weaponBodyVM.material = this.weaponBodyVM.material;
      }
    }
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.visorMat.dispose();
    this.vestMat.dispose();
  }
}
