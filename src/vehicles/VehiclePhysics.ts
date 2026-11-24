import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { MapId } from '../types/game';
import { ObstacleBounds } from '../world/Environment';
import {
  getSurfaceTypeAt,
  getTerrainHeight,
  getTerrainNormal,
  ISLAND_PLAYABLE_RADIUS,
  SurfaceType,
} from '../world/Terrain';
import { VehicleSpec } from './VehicleCatalog';

export interface VehicleDriveInput {
  throttle: number; // -1 (brake/reverse) .. +1 (accelerate)
  steer: number; // -1 (left) .. +1 (right)
  handbrake: boolean;
}

export interface VehiclePhysicsResult {
  collided: boolean;
  impactSpeed: number;
  hitVehicleId: string | null;
  brakingLightsOn: boolean;
}

export class VehiclePhysicsBody {
  public x: number;
  public y: number; // Ground wheel contact elevation
  public z: number;
  public yaw: number;

  public vx = 0;
  public vz = 0;
  public forwardSpeed = 0;
  public steerAngle = 0;
  public wheelSpin = 0;

  public pitch = 0;
  public roll = 0;
  public suspHeave = 0;
  public suspPitch = 0;
  public suspRoll = 0;
  public surface: SurfaceType = 'offroad';

  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public readonly colliderCenterOffsetY: number;

  private prevGroundY: number;

  constructor(
    public readonly id: string,
    public readonly spec: VehicleSpec,
    startX: number,
    startZ: number,
    startYaw: number,
    physics: PhysicsWorld,
    mapId: MapId,
  ) {
    this.x = startX;
    this.z = startZ;
    this.yaw = startYaw;
    this.y = getTerrainHeight(startX, startZ, mapId);
    this.prevGroundY = this.y;

    // Raise collider bottom slightly above ground clearance so undulating terrain triangles never snag bumpers
    const clearanceLift = 0.34;
    const bodyHeight = Math.max(0.75, spec.height - clearanceLift);
    this.colliderCenterOffsetY = clearanceLift + bodyHeight * 0.5;

    const registered = physics.registerVehicleCollider(
      id,
      this.x,
      this.y + this.colliderCenterOffsetY,
      this.z,
      spec.width * 0.48,
      bodyHeight * 0.5,
      spec.length * 0.48,
      this.yaw,
    );
    this.body = registered.body;
    this.collider = registered.collider;
  }

  public syncTerrainRestPose(mapId: MapId, physics: PhysicsWorld): void {
    const g = this.sampleFourWheelTerrain(this.x, this.z, this.yaw, mapId);
    this.y = g.avgY;
    this.prevGroundY = g.avgY;
    this.pitch = g.pitch;
    this.roll = g.roll;
    this.surface = getSurfaceTypeAt(this.x, this.z, mapId);
    physics.syncVehicleTransform(
      this.body,
      this.x,
      this.y + this.colliderCenterOffsetY,
      this.z,
      this.yaw,
    );
  }

  public step(
    dt: number,
    input: VehicleDriveInput,
    hasFuel: boolean,
    isDestroyed: boolean,
    isOccupied: boolean,
    physics: PhysicsWorld,
    mapId: MapId,
  ): VehiclePhysicsResult {
    this.surface = getSurfaceTypeAt(this.x, this.z, mapId);
    const speedMult = this.spec.surfaceSpeedMult[this.surface];
    const gripMult = this.spec.surfaceGripMult[this.surface];

    const effectiveThrottle = !isDestroyed && hasFuel ? THREE.MathUtils.clamp(input.throttle, -1, 1) : 0;
    const effectiveSteer = !isDestroyed ? THREE.MathUtils.clamp(input.steer, -1, 1) : 0;

    // Smooth steering angle
    const speedAbs = Math.abs(this.forwardSpeed);
    const highSpeedSteerScale = THREE.MathUtils.lerp(1.0, 0.54, Math.min(1, speedAbs / 24));
    const targetSteer = -effectiveSteer * this.spec.steerAngleRad * highSpeedSteerScale;
    this.steerAngle = THREE.MathUtils.damp(
      this.steerAngle,
      targetSteer,
      this.spec.steerRate * 2.4,
      dt,
    );

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    // Project existing world velocity onto vehicle frame
    let vForward = this.vx * forwardX + this.vz * forwardZ;
    let vRight = this.vx * rightX + this.vz * rightZ;

    const maxFwd = this.spec.maxSpeedForward * speedMult;
    const maxRev = this.spec.maxSpeedReverse * Math.min(1, speedMult + 0.15);

    let isBraking = false;
    let longitudinalAccel = 0;

    if (input.handbrake || isDestroyed) {
      isBraking = true;
      const decel = (isDestroyed ? 14 : this.spec.handbrakeDecel) * gripMult;
      if (Math.abs(vForward) <= decel * dt) {
        vForward = 0;
      } else {
        vForward -= Math.sign(vForward) * decel * dt;
      }
      longitudinalAccel = -Math.sign(vForward) * 6;
    } else if (effectiveThrottle > 0.05) {
      if (vForward < -0.8) {
        // Active braking while reversing
        isBraking = true;
        const brk = this.spec.braking * gripMult * effectiveThrottle;
        vForward += brk * dt;
        longitudinalAccel = brk;
      } else {
        const powerFactor = 1.0 - Math.min(0.45, (Math.max(0, vForward) / Math.max(1, maxFwd)) * 0.42);
        const accel = this.spec.acceleration * effectiveThrottle * powerFactor * (0.65 + 0.35 * speedMult);
        vForward = Math.min(maxFwd, vForward + accel * dt);
        longitudinalAccel = accel;
      }
    } else if (effectiveThrottle < -0.05) {
      if (vForward > 0.8) {
        // Braking from forward motion
        isBraking = true;
        const brk = this.spec.braking * gripMult * Math.abs(effectiveThrottle);
        vForward -= brk * dt;
        longitudinalAccel = -brk;
      } else {
        // Reverse acceleration
        const revAccel = this.spec.acceleration * 0.65 * Math.abs(effectiveThrottle);
        vForward = Math.max(-maxRev, vForward - revAccel * dt);
        longitudinalAccel = -revAccel * 0.6;
      }
    } else {
      // Natural rolling + aero drag
      const coastDrag = (this.spec.drag + (this.surface === 'shallow_water' ? 4.2 : 0.45)) * dt;
      if (Math.abs(vForward) <= coastDrag) {
        vForward = 0;
      } else {
        vForward -= Math.sign(vForward) * coastDrag;
      }
    }

    // Slope gravity effect along vehicle forward axis
    const normal = getTerrainNormal(this.x, this.z, mapId);
    const uphillCos = -(forwardX * normal.x + forwardZ * normal.z); // >0 if climbing uphill
    if (uphillCos > 0.08) {
      // steeper slopes resist climb more strongly for non-offroad vehicles
      const steepnessPenalty = normal.y < this.spec.maxClimbSlopeCos ? 18.0 : 6.5;
      vForward -= uphillCos * steepnessPenalty * dt;
    }

    // Steering angular integration (bicycle approximation)
    if (Math.abs(vForward) > 0.25 && Math.abs(this.steerAngle) > 0.002) {
      const turnRadiusFactor = Math.tan(this.steerAngle) / Math.max(2.0, this.spec.wheelbase);
      const lowSpeedBoost = Math.min(1.0, Math.abs(vForward) / 2.2);
      const yawDelta = vForward * turnRadiusFactor * lowSpeedBoost * dt;
      this.yaw += yawDelta;
    }

    // Lateral tire grip / drift damping
    const effGrip =
      this.spec.lateralGrip *
      gripMult *
      (input.handbrake ? 0.32 : 1.0) *
      (this.surface === 'snow' ? 0.82 : 1.0);
    vRight = THREE.MathUtils.damp(vRight, 0, effGrip, dt);

    const newForwardX = -Math.sin(this.yaw);
    const newForwardZ = -Math.cos(this.yaw);
    const newRightX = Math.cos(this.yaw);
    const newRightZ = -Math.sin(this.yaw);

    this.vx = newForwardX * vForward + newRightX * vRight;
    this.vz = newForwardZ * vForward + newRightZ * vRight;
    this.forwardSpeed = vForward;

    const desiredDx = this.vx * dt;
    const desiredDz = this.vz * dt;

    // Sample terrain height at predicted position
    const predX = this.x + desiredDx;
    const predZ = this.z + desiredDz;
    const terrainSample = this.sampleFourWheelTerrain(predX, predZ, this.yaw, mapId);
    const targetCenterY = terrainSample.avgY + this.colliderCenterOffsetY;

    const prevSpeed = Math.hypot(this.vx, this.vz);
    const moveRes = physics.moveVehicleCollider(
      this.collider,
      this.body,
      desiredDx,
      targetCenterY,
      desiredDz,
      this.yaw,
      isOccupied,
    );

    this.x = moveRes.x;
    this.z = moveRes.z;

    // Clamp inside island playable perimeter
    const radial = Math.hypot(this.x, this.z);
    if (radial > ISLAND_PLAYABLE_RADIUS - 3.5) {
      const clampScale = (ISLAND_PLAYABLE_RADIUS - 3.5) / radial;
      this.x *= clampScale;
      this.z *= clampScale;
      this.vx *= -0.25;
      this.vz *= -0.25;
      this.forwardSpeed *= -0.25;
      physics.syncVehicleTransform(
        this.body,
        this.x,
        this.y + this.colliderCenterOffsetY,
        this.z,
        this.yaw,
      );
    }

    // Re-sample terrain at settled position for accurate pitch/roll/heave
    const settled = this.sampleFourWheelTerrain(this.x, this.z, this.yaw, mapId);
    const groundDeltaY = settled.avgY - this.prevGroundY;
    this.prevGroundY = settled.avgY;
    this.y = settled.avgY;

    this.pitch = THREE.MathUtils.damp(this.pitch, settled.pitch, 12, dt);
    this.roll = THREE.MathUtils.damp(this.roll, settled.roll, 12, dt);

    // Dynamic body suspension heave, pitch squat/dive & cornering roll
    const targetHeave = THREE.MathUtils.clamp(-groundDeltaY * 0.45, -0.1, 0.1);
    const targetSuspPitch = THREE.MathUtils.clamp(
      -longitudinalAccel * 0.0028,
      -this.spec.maxPitchRad,
      this.spec.maxPitchRad,
    );
    const cornerForce = vForward * Math.sin(this.steerAngle) * 0.012;
    const targetSuspRoll = THREE.MathUtils.clamp(
      cornerForce,
      -this.spec.maxRollRad,
      this.spec.maxRollRad,
    );

    this.suspHeave = THREE.MathUtils.damp(
      this.suspHeave,
      targetHeave,
      this.spec.suspensionStiffness,
      dt,
    );
    this.suspPitch = THREE.MathUtils.damp(
      this.suspPitch,
      targetSuspPitch,
      this.spec.suspensionStiffness,
      dt,
    );
    this.suspRoll = THREE.MathUtils.damp(
      this.suspRoll,
      targetSuspRoll,
      this.spec.suspensionStiffness,
      dt,
    );

    // Wheel spin rotation
    const wheelR = this.spec.wheels[0]?.radius ?? 0.38;
    this.wheelSpin -= (vForward * dt) / wheelR;

    // Resolve impact speed on collision
    let impactSpeed = 0;
    if (moveRes.blocked && dt > 0) {
      const actualSpeed = Math.hypot(
        (this.x - (predX - desiredDx)) / dt,
        (this.z - (predZ - desiredDz)) / dt,
      );
      impactSpeed = Math.max(0, prevSpeed - actualSpeed);
      if (impactSpeed > 1.8) {
        this.vx *= 0.35;
        this.vz *= 0.35;
        this.forwardSpeed *= 0.35;
      }
    }

    return {
      collided: moveRes.blocked && impactSpeed > 2.2,
      impactSpeed,
      hitVehicleId: moveRes.hitVehicleId,
      brakingLightsOn: isBraking,
    };
  }

  public applyCollisionImpulse(dvx: number, dvz: number): void {
    this.vx += dvx;
    this.vz += dvz;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.forwardSpeed = this.vx * fx + this.vz * fz;
  }

  private sampleFourWheelTerrain(
    cx: number,
    cz: number,
    yaw: number,
    mapId: MapId,
  ): { avgY: number; pitch: number; roll: number } {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);

    const hw = this.spec.trackWidth * 0.5;
    const hl = this.spec.wheelbase * 0.5;

    const hFL = getTerrainHeight(cx + fx * hl - rx * hw, cz + fz * hl - rz * hw, mapId);
    const hFR = getTerrainHeight(cx + fx * hl + rx * hw, cz + fz * hl + rz * hw, mapId);
    const hRL = getTerrainHeight(cx - fx * hl - rx * hw, cz - fz * hl - rz * hw, mapId);
    const hRR = getTerrainHeight(cx - fx * hl + rx * hw, cz - fz * hl + rz * hw, mapId);

    const frontAvg = (hFL + hFR) * 0.5;
    const rearAvg = (hRL + hRR) * 0.5;
    const leftAvg = (hFL + hRL) * 0.5;
    const rightAvg = (hFR + hRR) * 0.5;

    const avgY = (hFL + hFR + hRL + hRR) * 0.25;
    // Nose up (+pitch around local +X) when frontAvg > rearAvg
    const pitch = Math.atan2(frontAvg - rearAvg, Math.max(1.2, this.spec.wheelbase));
    // Left higher -> roll right (-rotation.z)
    const roll = Math.atan2(rightAvg - leftAvg, Math.max(1.0, this.spec.trackWidth));

    return { avgY, pitch, roll };
  }

  public findSafeExitPosition(
    physics: PhysicsWorld,
    obstacles: ObstacleBounds[],
    mapId: MapId,
  ): { x: number; y: number; z: number } {
    const hw = this.spec.width * 0.5;
    const hl = this.spec.length * 0.5;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    // Priority order: Driver Left -> Passenger Right -> Rear Left -> Rear Right -> Front Left -> Rear -> Front
    const localCandidates: Array<[number, number]> = [
      [-(hw + 1.05), 0.15],
      [hw + 1.05, 0.15],
      [-(hw + 1.05), hl * 0.65],
      [hw + 1.05, hl * 0.65],
      [-(hw + 1.05), -hl * 0.65],
      [0, hl + 1.15],
      [0, -(hl + 1.15)],
      [-(hw + 1.8), 0],
      [hw + 1.8, 0],
    ];

    for (const [lx, lz] of localCandidates) {
      // Forward axis is -Z locally: world = center + rx * lx - fx * lz
      const cx = this.x + rx * lx - fx * lz;
      const cz = this.z + rz * lx - fz * lz;

      if (Math.hypot(cx, cz) > ISLAND_PLAYABLE_RADIUS - 3.0) continue;
      const cy = getTerrainHeight(cx, cz, mapId);
      if (mapId !== 'arid_canyon' && cy < 0.35) continue;

      let blockedByObs = false;
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (Math.hypot(cx - obs.x, cz - obs.z) < obs.radius + 0.6) {
          blockedByObs = true;
          break;
        }
      }
      if (blockedByObs) continue;

      // Check Rapier static geometry clearance from vehicle door outward
      const dx = cx - this.x;
      const dz = cz - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.1) {
        const wallHit = physics.castWorldRay(
          this.x,
          this.y + 1.05,
          this.z,
          dx / dist,
          0,
          dz / dist,
          dist + 0.45,
        );
        if (wallHit && wallHit.distance < dist + 0.35) {
          continue;
        }
      }

      // Vertical clearance check so player does not spawn inside overhanging walls/crates
      const overheadHit = physics.castWorldRay(cx, cy + 0.35, cz, 0, 1, 0, 1.8);
      if (overheadHit && overheadHit.distance < 1.65) {
        continue;
      }

      return { x: cx, y: cy, z: cz };
    }

    // Fallback: step directly atop vehicle roof safely above collider
    return {
      x: this.x,
      y: this.y + this.spec.height + 0.25,
      z: this.z,
    };
  }

  public dispose(physics: PhysicsWorld): void {
    physics.unregisterVehicleCollider(this.collider, this.body);
  }
}
