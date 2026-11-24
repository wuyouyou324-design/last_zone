import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import {
  MapId,
  MinimapBlip,
  VehicleHudState,
  VehiclePrompt,
  VehicleType,
} from '../types/game';
import { ObstacleBounds } from '../world/Environment';
import {
  getVehicleSpawnsForMap,
  VEHICLE_CATALOG,
  VehicleSpec,
} from './VehicleCatalog';
import { VehicleModelInstance, VehicleModelsFactory } from './VehicleModels';
import { VehicleDriveInput, VehiclePhysicsBody } from './VehiclePhysics';

export interface VehicleCollisionEvent {
  vehicleId: string;
  impactSpeed: number;
  isOccupiedByPlayer: boolean;
  hitVehicleId: string | null;
}

export interface VehicleInstance {
  id: string;
  spec: VehicleSpec;
  physics: VehiclePhysicsBody;
  model: VehicleModelInstance;
  health: number;
  fuel: number;
  destroyed: boolean;
  occupantId: string | null;
}

const SPEED_TO_KMH = 3.6;

export class VehicleManager {
  public readonly group = new THREE.Group();
  public vehicles: VehicleInstance[] = [];
  private factory = new VehicleModelsFactory();
  private byId = new Map<string, VehicleInstance>();
  private smokeGroup = new THREE.Group();
  private smokeMaterial: THREE.MeshBasicMaterial;
  private smokeGeo: THREE.SphereGeometry;
  private smokeMeshes = new Map<string, THREE.Mesh>();

  constructor() {
    this.group.add(this.smokeGroup);
    this.smokeGeo = new THREE.SphereGeometry(0.45, 7, 7);
    this.smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x33383e,
      transparent: true,
      opacity: 0.55,
    });
  }

  public spawnForMap(mapId: MapId, physics: PhysicsWorld): void {
    this.clear(physics);
    const spawns = getVehicleSpawnsForMap(mapId);

    spawns.forEach((sp, idx) => {
      const spec = VEHICLE_CATALOG[sp.type];
      const id = `veh_${sp.type}_${idx}`;
      const phys = new VehiclePhysicsBody(id, spec, sp.x, sp.z, sp.yaw, physics, mapId);
      phys.syncTerrainRestPose(mapId, physics);

      const model = this.factory.createVehicleInstance(sp.type);
      model.root.position.set(phys.x, phys.y, phys.z);
      model.root.rotation.order = 'YXZ';
      model.root.rotation.set(phys.pitch, phys.yaw, phys.roll);

      const smoke = new THREE.Mesh(this.smokeGeo, this.smokeMaterial);
      smoke.visible = false;
      this.smokeGroup.add(smoke);
      this.smokeMeshes.set(id, smoke);

      this.group.add(model.root);
      const instance: VehicleInstance = {
        id,
        spec,
        physics: phys,
        model,
        health: spec.maxHealth,
        fuel: Math.round(spec.maxFuel * (0.72 + ((idx * 17) % 25) / 100)),
        destroyed: false,
        occupantId: null,
      };
      this.vehicles.push(instance);
      this.byId.set(id, instance);
    });
  }

  public getVehicleById(id: string | null): VehicleInstance | null {
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  public getPlayerVehicle(playerId = 'player'): VehicleInstance | null {
    for (const v of this.vehicles) {
      if (v.occupantId === playerId) return v;
    }
    return null;
  }

  public findNearestInteractable(
    px: number,
    py: number,
    pz: number,
    maxDist = 4.2,
  ): VehiclePrompt | null {
    let best: VehicleInstance | null = null;
    let bestDist = Infinity;
    for (const v of this.vehicles) {
      const dx = v.physics.x - px;
      const dz = v.physics.z - pz;
      const dy = Math.abs(v.physics.y - py);
      const d = Math.hypot(dx, dz);
      // Scale interaction envelope cleanly around each vehicle's hull length
      const reach = maxDist + v.spec.length * 0.22;
      if (d < reach && dy < 3.5 && d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    if (!best) return null;
    return {
      id: best.id,
      name: best.spec.name,
      type: best.spec.type,
      occupied: best.occupantId !== null,
      disabled: best.destroyed,
    };
  }

  public tryEnterNearest(
    actorId: string,
    px: number,
    py: number,
    pz: number,
  ): VehicleInstance | null {
    if (this.getPlayerVehicle(actorId)) return null;
    const prompt = this.findNearestInteractable(px, py, pz);
    if (!prompt || prompt.occupied || prompt.disabled) return null;
    const vehicle = this.byId.get(prompt.id);
    if (!vehicle) return null;
    vehicle.occupantId = actorId;
    return vehicle;
  }

  public exitVehicle(
    actorId: string,
    physics: PhysicsWorld,
    obstacles: ObstacleBounds[],
    mapId: MapId,
  ): { vehicle: VehicleInstance; exitPos: { x: number; y: number; z: number } } | null {
    const vehicle = this.getPlayerVehicle(actorId);
    if (!vehicle) return null;
    const exitPos = vehicle.physics.findSafeExitPosition(physics, obstacles, mapId);
    vehicle.occupantId = null;
    return { vehicle, exitPos };
  }

  public applyDamage(
    vehicleId: string,
    amount: number,
  ): { vehicle: VehicleInstance; justDestroyed: boolean } | null {
    const v = this.byId.get(vehicleId);
    if (!v || v.destroyed) return null;
    v.health = Math.max(0, v.health - amount);
    let justDestroyed = false;
    if (v.health <= 0 && !v.destroyed) {
      v.destroyed = true;
      v.model.setDestroyedVisual(true);
      justDestroyed = true;
    }
    return { vehicle: v, justDestroyed };
  }

  public update(
    dt: number,
    elapsed: number,
    activeDriverId: string | null,
    driverInput: VehicleDriveInput,
    cameraPos: THREE.Vector3,
    physics: PhysicsWorld,
    mapId: MapId,
    onCollision: (ev: VehicleCollisionEvent) => void,
    onVehicleDestroyed: (v: VehicleInstance) => void,
  ): void {
    const emptyInput: VehicleDriveInput = { throttle: 0, steer: 0, handbrake: true };

    for (const v of this.vehicles) {
      const isPlayerDriving = activeDriverId !== null && v.occupantId === activeDriverId;
      const input = isPlayerDriving ? driverInput : emptyInput;

      // Burn fuel when actively accelerating or reversing under power
      if (isPlayerDriving && !v.destroyed && v.fuel > 0 && Math.abs(input.throttle) > 0.08) {
        v.fuel = Math.max(0, v.fuel - v.spec.fuelBurnPerSec * Math.abs(input.throttle) * dt);
      }

      const shouldSimulatePhysics =
        isPlayerDriving ||
        v.occupantId !== null ||
        Math.abs(v.physics.vx) > 0.05 ||
        Math.abs(v.physics.vz) > 0.05;

      let brakingLights = false;
      if (shouldSimulatePhysics) {
        const res = v.physics.step(
          dt,
          input,
          v.fuel > 0,
          v.destroyed,
          v.occupantId !== null,
          physics,
          mapId,
        );
        brakingLights = res.brakingLightsOn;

        if (res.collided) {
          if (res.hitVehicleId) {
            const other = this.byId.get(res.hitVehicleId);
            if (other) {
              const massRatio = v.spec.massKg / (v.spec.massKg + other.spec.massKg);
              const fx = -Math.sin(v.physics.yaw);
              const fz = -Math.cos(v.physics.yaw);
              other.physics.applyCollisionImpulse(
                fx * res.impactSpeed * massRatio * 0.75,
                fz * res.impactSpeed * massRatio * 0.75,
              );
              const otherDmg = Math.max(2, (res.impactSpeed - 3.0) * 4.2 * massRatio);
              if (res.impactSpeed > 4.2) {
                const dmgRes = this.applyDamage(other.id, otherDmg);
                if (dmgRes?.justDestroyed) {
                  onVehicleDestroyed(other);
                }
              }
            }
          }

          if (res.impactSpeed > 4.2) {
            const selfDmg = Math.max(2, (res.impactSpeed - 3.2) * 3.8);
            const dmgRes = this.applyDamage(v.id, selfDmg);
            if (dmgRes?.justDestroyed) {
              onVehicleDestroyed(v);
            }
          }

          onCollision({
            vehicleId: v.id,
            impactSpeed: res.impactSpeed,
            isOccupiedByPlayer: isPlayerDriving,
            hitVehicleId: res.hitVehicleId,
          });
        }
      }

      // Sync Three.js transform + wheel spin/steering + suspension + LOD
      v.model.root.position.set(v.physics.x, v.physics.y, v.physics.z);
      v.model.root.rotation.order = 'YXZ';
      v.model.root.rotation.set(v.physics.pitch, v.physics.yaw, v.physics.roll);

      v.model.chassisPivot.position.y = v.physics.suspHeave;
      v.model.chassisPivot.rotation.set(v.physics.suspPitch, 0, v.physics.suspRoll);

      for (const w of v.model.wheels) {
        if (w.steerable) {
          w.steerPivot.rotation.y = v.physics.steerAngle;
        }
        w.spinPivot.rotation.x = v.physics.wheelSpin;
      }

      v.model.setBraking(brakingLights && !v.destroyed);
      const distSq =
        (v.physics.x - cameraPos.x) ** 2 +
        (v.physics.y - cameraPos.y) ** 2 +
        (v.physics.z - cameraPos.z) ** 2;
      v.model.setLod(distSq);

      // Smoke plume when damaged below 35% or destroyed
      const smoke = this.smokeMeshes.get(v.id);
      if (smoke) {
        const lowHp = v.destroyed || v.health < v.spec.maxHealth * 0.35;
        smoke.visible = lowHp;
        if (lowHp) {
          const hoodDist = v.spec.length * 0.34;
          const fx = -Math.sin(v.physics.yaw);
          const fz = -Math.cos(v.physics.yaw);
          const bob = (elapsed * 1.4) % 1.0;
          smoke.position.set(
            v.physics.x + fx * hoodDist,
            v.physics.y + v.spec.height * 0.65 + bob * 1.35,
            v.physics.z + fz * hoodDist,
          );
          const s = v.destroyed ? 1.15 + bob * 0.7 : 0.65 + bob * 0.45;
          smoke.scale.setScalar(s);
        }
      }
    }
  }

  public getHudState(vehicle: VehicleInstance, zoomIndex: number): VehicleHudState {
    const absSpeed = Math.abs(vehicle.physics.forwardSpeed);
    const speedKmh = Math.round(absSpeed * SPEED_TO_KMH);
    const maxSpeedKmh = Math.round(vehicle.spec.maxSpeedForward * SPEED_TO_KMH);

    let gear: VehicleHudState['gear'] = 'N';
    if (vehicle.physics.forwardSpeed < -0.5) {
      gear = 'R';
    } else if (absSpeed > 0.6) {
      const ratio = Math.min(1, absSpeed / Math.max(1, vehicle.spec.maxSpeedForward));
      if (ratio < 0.22) gear = '1';
      else if (ratio < 0.44) gear = '2';
      else if (ratio < 0.66) gear = '3';
      else if (ratio < 0.85) gear = '4';
      else gear = '5';
    }

    return {
      id: vehicle.id,
      name: vehicle.spec.name,
      type: vehicle.spec.type,
      speedKmh,
      maxSpeedKmh,
      gear,
      fuel: Math.round(vehicle.fuel),
      maxFuel: vehicle.spec.maxFuel,
      health: Math.round(vehicle.health),
      maxHealth: vehicle.spec.maxHealth,
      surface: vehicle.physics.surface,
      handbrake: false,
      cameraZoomIndex: zoomIndex,
    };
  }

  public getMinimapBlips(): MinimapBlip[] {
    return this.vehicles
      .filter((v) => !v.destroyed)
      .map((v) => ({
        x: v.physics.x,
        z: v.physics.z,
        kind: 'vehicle' as const,
        alpha: 0.9,
      }));
  }

  public getVehicleColorTag(type: VehicleType): string {
    switch (type) {
      case 'sedan':
        return 'Sedan';
      case 'suv':
        return '4x4 SUV';
      case 'pickup':
        return 'Pickup';
      case 'truck':
        return 'Transport';
    }
  }

  public clear(physics: PhysicsWorld): void {
    for (const v of this.vehicles) {
      this.group.remove(v.model.root);
      v.model.dispose();
      v.physics.dispose(physics);
    }
    for (const m of this.smokeMeshes.values()) {
      this.smokeGroup.remove(m);
    }
    this.smokeMeshes.clear();
    this.vehicles = [];
    this.byId.clear();
  }

  public dispose(physics: PhysicsWorld): void {
    this.clear(physics);
    this.factory.dispose();
    this.smokeGeo.dispose();
    this.smokeMaterial.dispose();
  }
}
