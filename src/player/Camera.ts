import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { CameraMode } from '../types/game';

const _pivot = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  public mode: CameraMode = 'first-person';
  public yaw = 0;
  public pitch = 0;

  private baseFov = 78;
  private currentFov = 78;
  private currentEyeOffset = 1.62;
  private currentBackDist = 0;
  private currentRightOffset = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 450);
  }

  public setBaseFov(fov: number): void {
    this.baseFov = fov;
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public toggleMode(): CameraMode {
    this.mode = this.mode === 'first-person' ? 'third-person' : 'first-person';
    return this.mode;
  }

  public addLookDelta(dx: number, dy: number, sensitivity: number): void {
    const scale = 0.0021 * sensitivity;
    this.yaw -= dx * scale;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * scale, -1.32, 1.32);
  }

  public addRecoil(amount: number): void {
    this.recoilPitch = Math.min(0.18, this.recoilPitch + amount);
    this.recoilYaw += (Math.random() - 0.5) * amount * 0.45;
  }

  public update(
    dt: number,
    feetX: number,
    feetY: number,
    feetZ: number,
    isCrouching: boolean,
    isAiming: boolean,
    adsFovDelta: number,
    physics: PhysicsWorld,
    playerColliderHandle: number,
  ): void {
    // Smooth recoil recovery
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 12, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 12, dt);

    const effYaw = this.yaw + this.recoilYaw;
    const effPitch = THREE.MathUtils.clamp(this.pitch + this.recoilPitch, -1.35, 1.35);

    const targetEye = isCrouching ? 1.08 : 1.62;
    this.currentEyeOffset = THREE.MathUtils.damp(this.currentEyeOffset, targetEye, 14, dt);

    const targetBack = this.mode === 'third-person' ? (isAiming ? 1.85 : 3.0) : 0;
    const targetRight = this.mode === 'third-person' ? 0.58 : 0;
    this.currentBackDist = THREE.MathUtils.damp(this.currentBackDist, targetBack, 14, dt);
    this.currentRightOffset = THREE.MathUtils.damp(this.currentRightOffset, targetRight, 14, dt);

    const targetFov = isAiming ? Math.max(40, this.baseFov + adsFovDelta) : this.baseFov;
    if (Math.abs(this.currentFov - targetFov) > 0.02) {
      this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 14, dt);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    _pivot.set(feetX, feetY + this.currentEyeOffset, feetZ);

    const cosPitch = Math.cos(effPitch);
    const forwardX = -Math.sin(effYaw) * cosPitch;
    const forwardY = Math.sin(effPitch);
    const forwardZ = -Math.cos(effYaw) * cosPitch;

    const rightX = Math.cos(effYaw);
    const rightZ = -Math.sin(effYaw);

    if (this.currentBackDist < 0.05) {
      // First-person camera at eye pivot
      this.camera.position.copy(_pivot);
      _lookTarget.set(
        _pivot.x + forwardX * 20,
        _pivot.y + forwardY * 20,
        _pivot.z + forwardZ * 20,
      );
      this.camera.lookAt(_lookTarget);
    } else {
      // Over-the-shoulder third-person camera with Rapier wall/terrain anti-clipping
      _desiredCamPos.set(
        _pivot.x - forwardX * this.currentBackDist + rightX * this.currentRightOffset,
        _pivot.y - forwardY * this.currentBackDist + 0.25,
        _pivot.z - forwardZ * this.currentBackDist + rightZ * this.currentRightOffset,
      );

      _rayDir.copy(_desiredCamPos).sub(_pivot);
      const dist = _rayDir.length();
      if (dist > 0.05) {
        _rayDir.divideScalar(dist);
        const hit = physics.castRay(
          _pivot.x,
          _pivot.y,
          _pivot.z,
          _rayDir.x,
          _rayDir.y,
          _rayDir.z,
          dist,
          playerColliderHandle,
        );
        if (hit && hit.distance < dist) {
          const safeDist = Math.max(0.35, hit.distance - 0.22);
          _desiredCamPos.copy(_pivot).addScaledVector(_rayDir, safeDist);
        }
      }

      this.camera.position.copy(_desiredCamPos);
      _lookTarget.set(
        _pivot.x + forwardX * 28,
        _pivot.y + forwardY * 28,
        _pivot.z + forwardZ * 28,
      );
      this.camera.lookAt(_lookTarget);
    }
  }

  public getAimForward(target: THREE.Vector3): THREE.Vector3 {
    const effYaw = this.yaw + this.recoilYaw;
    const effPitch = THREE.MathUtils.clamp(this.pitch + this.recoilPitch, -1.35, 1.35);
    const cosPitch = Math.cos(effPitch);
    target.set(
      -Math.sin(effYaw) * cosPitch,
      Math.sin(effPitch),
      -Math.cos(effYaw) * cosPitch,
    );
    return target.normalize();
  }
}
