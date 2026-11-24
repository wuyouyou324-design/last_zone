import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { WeaponSpec } from '../types/game';

export interface CombatTarget {
  id: string;
  x: number;
  y: number; // feet Y
  z: number;
  height: number;
  radius: number;
  alive: boolean;
}

export interface ShotOutcome {
  hitTargetId: string | null;
  hitVehicleId?: string | null;
  isHeadshot: boolean;
  damage: number;
  hitPoint: THREE.Vector3;
}

interface TracerSlot {
  line: THREE.Line;
  positions: Float32Array;
  life: number;
  maxLife: number;
  active: boolean;
}

interface ImpactSlot {
  mesh: THREE.Mesh;
  life: number;
  active: boolean;
}

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _hitPt = new THREE.Vector3();

export class CombatSystem {
  public readonly fxGroup = new THREE.Group();
  private tracers: TracerSlot[] = [];
  private impacts: ImpactSlot[] = [];
  private tracerMat: THREE.LineBasicMaterial;
  private impactGeo: THREE.SphereGeometry;
  private impactMat: THREE.MeshBasicMaterial;
  private muzzleLight: THREE.PointLight;
  private muzzleFlashLife = 0;

  constructor(private physics: PhysicsWorld) {
    this.tracerMat = new THREE.LineBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.85,
    });

    for (let i = 0; i < 24; i++) {
      const positions = new Float32Array(6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geo, this.tracerMat);
      line.visible = false;
      line.frustumCulled = false;
      this.fxGroup.add(line);
      this.tracers.push({ line, positions, life: 0, maxLife: 0.08, active: false });
    }

    this.impactGeo = new THREE.SphereGeometry(0.11, 6, 6);
    this.impactMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(this.impactGeo, this.impactMat);
      mesh.visible = false;
      this.fxGroup.add(mesh);
      this.impacts.push({ mesh, life: 0, active: false });
    }

    this.muzzleLight = new THREE.PointLight(0xfbbf24, 0, 8, 2);
    this.fxGroup.add(this.muzzleLight);
  }

  public fireWeaponRay(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    muzzleStart: THREE.Vector3,
    weapon: WeaponSpec,
    targets: CombatTarget[],
    crouchingSpreadScale = 1,
    excludeColliderHandle?: number,
  ): ShotOutcome[] {
    const outcomes: ShotOutcome[] = [];
    this.muzzleLight.position.copy(muzzleStart);
    this.muzzleLight.intensity = 3.2;
    this.muzzleFlashLife = 0.045;

    _right.crossVectors(forward, _up).normalize();
    _camUp.crossVectors(_right, forward).normalize();

    const effectiveSpread = weapon.spread * crouchingSpreadScale;

    for (let p = 0; p < weapon.pellets; p++) {
      const rx = (Math.random() - 0.5) * 2 * effectiveSpread;
      const ry = (Math.random() - 0.5) * 2 * effectiveSpread;
      _dir
        .copy(forward)
        .addScaledVector(_right, rx)
        .addScaledVector(_camUp, ry)
        .normalize();

      // 1. World geometry / terrain / building / vehicle occlusion raycast via Rapier
      const worldHit = this.physics.castWorldRay(
        origin.x,
        origin.y,
        origin.z,
        _dir.x,
        _dir.y,
        _dir.z,
        weapon.range,
        true,
      );
      void excludeColliderHandle;

      let bestDist = worldHit ? worldHit.distance : weapon.range;
      _hitPt.set(
        origin.x + _dir.x * bestDist,
        origin.y + _dir.y * bestDist,
        origin.z + _dir.z * bestDist,
      );

      let hitTargetId: string | null = null;
      let hitVehicleId: string | null = worldHit
        ? this.physics.getVehicleIdByColliderHandle(worldHit.colliderHandle)
        : null;
      let isHeadshot = false;

      // 2. Analytic ray-capsule check against active combatants closer than world wall/vehicle
      for (const target of targets) {
        if (!target.alive) continue;
        const hitInfo = this.intersectTargetCylinder(origin, _dir, target, bestDist);
        if (hitInfo) {
          bestDist = hitInfo.distance;
          _hitPt.set(
            origin.x + _dir.x * bestDist,
            origin.y + _dir.y * bestDist,
            origin.z + _dir.z * bestDist,
          );
          hitTargetId = target.id;
          hitVehicleId = null;
          isHeadshot = hitInfo.headshot;
        }
      }

      this.spawnTracer(muzzleStart, _hitPt);
      if (worldHit || hitTargetId) {
        this.spawnImpact(_hitPt);
      }

      const dmgMultiplier = isHeadshot ? 1.65 : 1.0;
      outcomes.push({
        hitTargetId,
        hitVehicleId,
        isHeadshot,
        damage: hitTargetId
          ? Math.round(weapon.damage * dmgMultiplier)
          : hitVehicleId
            ? Math.round(weapon.damage * 1.15)
            : 0,
        hitPoint: _hitPt.clone(),
      });
    }

    return outcomes;
  }

  private intersectTargetCylinder(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    target: CombatTarget,
    maxDist: number,
  ): { distance: number; headshot: boolean } | null {
    // Ray-XZ cylinder intersection followed by Y-span check
    const ocX = origin.x - target.x;
    const ocZ = origin.z - target.z;
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a < 1e-6) return null;
    const b = 2 * (ocX * dir.x + ocZ * dir.z);
    const c = ocX * ocX + ocZ * ocZ - target.radius * target.radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0.25 || t >= maxDist) return null;

    const hitY = origin.y + dir.y * t;
    if (hitY < target.y || hitY > target.y + target.height) return null;

    const headshot = hitY >= target.y + target.height * 0.74;
    return { distance: t, headshot };
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3): void {
    const slot = this.tracers.find((t) => !t.active) ?? this.tracers[0];
    slot.positions[0] = start.x;
    slot.positions[1] = start.y;
    slot.positions[2] = start.z;
    slot.positions[3] = end.x;
    slot.positions[4] = end.y;
    slot.positions[5] = end.z;
    slot.line.geometry.attributes.position.needsUpdate = true;
    slot.line.visible = true;
    slot.life = slot.maxLife;
    slot.active = true;
  }

  private spawnImpact(point: THREE.Vector3): void {
    const slot = this.impacts.find((s) => !s.active) ?? this.impacts[0];
    slot.mesh.position.copy(point);
    slot.mesh.visible = true;
    slot.life = 0.14;
    slot.active = true;
  }

  public update(dt: number): void {
    if (this.muzzleFlashLife > 0) {
      this.muzzleFlashLife -= dt;
      if (this.muzzleFlashLife <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.line.visible = false;
      }
    }

    for (const s of this.impacts) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
      }
    }
  }

  public dispose(): void {
    for (const t of this.tracers) {
      t.line.geometry.dispose();
    }
    this.tracerMat.dispose();
    this.impactGeo.dispose();
    this.impactMat.dispose();
  }
}
