import * as THREE from 'three';
import type { CharacterLodLevel } from './CharacterTypes';

const _projMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();

export class CharacterLODController {
  public currentLod: CharacterLodLevel = 0;
  private lod0Meshes: THREE.Object3D[] = [];
  private lod1Meshes: THREE.Object3D[] = [];
  private animAccum = 0;

  constructor(
    private lod0Distance = 34,
    private cullDistance = 120,
  ) {}

  public static updateCameraFrustum(camera: THREE.Camera): void {
    _projMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projMatrix);
  }

  public registerMeshes(lod0: THREE.Object3D[], lod1: THREE.Object3D[]): void {
    this.lod0Meshes = lod0;
    this.lod1Meshes = lod1;
    this.applyVisibility(0);
  }

  public evaluate(
    dt: number,
    actorPos: THREE.Vector3,
    cameraPos: THREE.Vector3,
    forceFullDetail = false,
  ): number {
    if (forceFullDetail) {
      this.applyVisibility(0);
      return dt;
    }

    const dist = actorPos.distanceTo(cameraPos);
    _sphere.center.set(actorPos.x, actorPos.y + 0.9, actorPos.z);
    _sphere.radius = 1.65;
    const inFrustum = _frustum.intersectsSphere(_sphere);

    let nextLod: CharacterLodLevel = 0;
    if (!inFrustum || dist > this.cullDistance) {
      nextLod = 2;
    } else if (dist > this.lod0Distance) {
      nextLod = 1;
    }

    this.applyVisibility(nextLod);

    if (nextLod === 0) {
      this.animAccum = 0;
      return dt;
    }

    // Throttle skeletal mixer evaluation when distant or culled
    const step = nextLod === 1 ? 1 / 24 : 1 / 4;
    this.animAccum += dt;
    if (this.animAccum >= step) {
      const out = this.animAccum;
      this.animAccum = 0;
      return out;
    }
    return 0;
  }

  private applyVisibility(level: CharacterLodLevel): void {
    if (this.currentLod === level) return;
    this.currentLod = level;
    const show0 = level === 0;
    const show1 = level === 1;
    for (const m of this.lod0Meshes) m.visible = show0;
    for (const m of this.lod1Meshes) m.visible = show1;
  }
}
