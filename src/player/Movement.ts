import { PhysicsWorld } from '../core/PhysicsWorld';
import { HealthSystem } from '../systems/Health';
import { ISLAND_PLAYABLE_RADIUS, getTerrainHeight } from '../world/Terrain';

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
}

export class MovementController {
  public position = { x: 0, y: 4, z: 0 };
  public verticalVelocity = 0;
  public grounded = false;
  public isCrouching = false;
  public isSprinting = false;
  public isMoving = false;
  public horizontalSpeed = 0;

  private readonly walkSpeed = 6.2;
  private readonly sprintSpeed = 9.4;
  private readonly crouchSpeed = 3.6;
  private readonly jumpSpeed = 8.4;
  private readonly gravity = 22.0;

  public reset(x: number, y: number, z: number, physics: PhysicsWorld): void {
    // Capsule center is ~0.9m above ground when standing
    const centerY = y + 0.95;
    this.position = { x, y: centerY, z };
    this.verticalVelocity = 0;
    this.grounded = true;
    this.isCrouching = false;
    this.isSprinting = false;
    this.isMoving = false;
    this.horizontalSpeed = 0;
    physics.setPlayerCrouchCollider(false);
    physics.teleportPlayer(x, centerY, z);
  }

  public update(
    dt: number,
    yaw: number,
    input: MovementInput,
    physics: PhysicsWorld,
    health: HealthSystem,
    heightAt: (x: number, z: number) => number = getTerrainHeight,
  ): void {
    if (health.eliminated) return;

    const prevCrouch = this.isCrouching;
    this.isCrouching = input.crouch;
    if (prevCrouch !== this.isCrouching) {
      physics.setPlayerCrouchCollider(this.isCrouching);
    }

    const moveZ = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const hasMove = moveX !== 0 || moveZ !== 0;

    let forwardX = -Math.sin(yaw);
    let forwardZ = -Math.cos(yaw);
    let rightX = Math.cos(yaw);
    let rightZ = -Math.sin(yaw);

    let dirX = forwardX * moveZ + rightX * moveX;
    let dirZ = forwardZ * moveZ + rightZ * moveX;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) {
      dirX /= len;
      dirZ /= len;
    }

    this.isMoving = hasMove;
    this.isSprinting =
      hasMove && input.sprint && !this.isCrouching && health.canSprint() && !health.isHealing();

    health.updateStamina(dt, this.isSprinting, this.isMoving);
    if (this.isSprinting && health.stamina <= 0.5) {
      this.isSprinting = false;
    }

    const targetSpeed = !hasMove
      ? 0
      : this.isCrouching
        ? this.crouchSpeed
        : this.isSprinting
          ? this.sprintSpeed
          : this.walkSpeed;

    this.horizontalSpeed = targetSpeed;

    if (this.grounded && input.jump && !this.isCrouching && health.consumeJumpStamina()) {
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
    }

    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = -2.2;
    } else {
      this.verticalVelocity = Math.max(-28, this.verticalVelocity - this.gravity * dt);
    }

    const dx = dirX * targetSpeed * dt;
    const dy = this.verticalVelocity * dt;
    const dz = dirZ * targetSpeed * dt;

    const result = physics.movePlayer(dx, dy, dz);
    this.position.x = result.x;
    this.position.y = result.y;
    this.position.z = result.z;
    this.grounded = result.grounded;

    // Keep player bounded within island coast perimeter
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > ISLAND_PLAYABLE_RADIUS) {
      const scale = ISLAND_PLAYABLE_RADIUS / r;
      this.position.x *= scale;
      this.position.z *= scale;
      const minY = heightAt(this.position.x, this.position.z) + 0.95;
      this.position.y = Math.max(this.position.y, minY);
      physics.teleportPlayer(this.position.x, this.position.y, this.position.z);
    }

    // Safety floor clamp in case of extreme frame spike
    const groundY = heightAt(this.position.x, this.position.z);
    const minCenterY = groundY + (this.isCrouching ? 0.65 : 0.9);
    if (this.position.y < minCenterY - 0.35) {
      this.position.y = minCenterY;
      this.verticalVelocity = 0;
      this.grounded = true;
      physics.teleportPlayer(this.position.x, this.position.y, this.position.z);
    }
  }

  public getFeetY(): number {
    return this.position.y - (this.isCrouching ? 0.65 : 0.9);
  }
}
