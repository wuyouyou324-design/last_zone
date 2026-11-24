import { PlayerInput } from './InputTypes';

const TOUCH_LOOK_GAIN = 1.65;

export class TouchInput {
  private moveX = 0;
  private moveY = 0;
  private lookAccumX = 0;
  private lookAccumY = 0;

  private sprintToggled = false;
  private crouchToggled = false;
  private fireHeld = false;
  private aimToggled = false;
  private jumpHeld = false;

  private pendingJump = false;
  private pendingReload = false;
  private pendingInteract = false;
  private pendingVehicleInteract = false;
  private pendingCycleWeapon = false;
  private pendingSwitchPrimary = false;
  private pendingSwitchSecondary = false;
  private pendingQuickHeal = false;
  private pendingToggleCamera = false;
  private pendingToggleInventory = false;
  private pendingTogglePause = false;

  private sensitivity = 1.0;

  constructor(private onActivity?: () => void) {}

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  public setMoveVector(x: number, y: number): void {
    if (x !== 0 || y !== 0) {
      this.onActivity?.();
    }
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      this.moveX = x / mag;
      this.moveY = y / mag;
    } else {
      this.moveX = Math.max(-1, Math.min(1, x));
      this.moveY = Math.max(-1, Math.min(1, y));
    }
  }

  public addLookDelta(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) {
      this.onActivity?.();
    }
    this.lookAccumX += dx;
    this.lookAccumY += dy;
  }

  public setFire(active: boolean): void {
    if (active) {
      this.onActivity?.();
    }
    this.fireHeld = active;
  }

  public setAim(active: boolean): void {
    this.onActivity?.();
    this.aimToggled = active;
  }

  public toggleAim(): boolean {
    this.onActivity?.();
    this.aimToggled = !this.aimToggled;
    return this.aimToggled;
  }

  public isAimActive(): boolean {
    return this.aimToggled;
  }

  public setSprint(active: boolean): void {
    this.onActivity?.();
    this.sprintToggled = active;
  }

  public toggleSprint(): boolean {
    this.onActivity?.();
    this.sprintToggled = !this.sprintToggled;
    return this.sprintToggled;
  }

  public isSprintActive(): boolean {
    return this.sprintToggled;
  }

  public toggleCrouch(): boolean {
    this.onActivity?.();
    this.crouchToggled = !this.crouchToggled;
    return this.crouchToggled;
  }

  public setCrouch(active: boolean): void {
    this.crouchToggled = active;
  }

  public triggerJump(held = true): void {
    this.onActivity?.();
    this.jumpHeld = held;
    this.pendingJump = true;
  }

  public releaseJump(): void {
    this.jumpHeld = false;
  }

  public triggerReload(): void {
    this.onActivity?.();
    this.pendingReload = true;
  }

  public triggerInteract(): void {
    this.onActivity?.();
    this.pendingInteract = true;
  }

  public triggerVehicleInteract(): void {
    this.onActivity?.();
    this.pendingVehicleInteract = true;
  }

  public setDrivingControls(steer: number, throttle: number, handbrake: boolean): void {
    this.onActivity?.();
    this.moveX = Math.max(-1, Math.min(1, steer));
    this.moveY = Math.max(-1, Math.min(1, throttle));
    this.jumpHeld = handbrake;
  }

  public triggerCycleWeapon(): void {
    this.onActivity?.();
    this.pendingCycleWeapon = true;
  }

  public triggerSwitchSlot(slot: 'primary' | 'secondary'): void {
    this.onActivity?.();
    if (slot === 'primary') {
      this.pendingSwitchPrimary = true;
    } else {
      this.pendingSwitchSecondary = true;
    }
  }

  public triggerQuickHeal(): void {
    this.onActivity?.();
    this.pendingQuickHeal = true;
  }

  public triggerToggleCamera(): void {
    this.onActivity?.();
    this.pendingToggleCamera = true;
  }

  public triggerToggleInventory(): void {
    this.onActivity?.();
    this.pendingToggleInventory = true;
  }

  public triggerTogglePause(): void {
    this.onActivity?.();
    this.pendingTogglePause = true;
  }

  public resetMatchState(): void {
    this.crouchToggled = false;
    this.resetContinuousInputs();
  }

  public resetContinuousInputs(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.lookAccumX = 0;
    this.lookAccumY = 0;
    this.fireHeld = false;
    this.aimToggled = false;
    this.sprintToggled = false;
    this.jumpHeld = false;
  }

  public consumeInto(out: PlayerInput, activeSource: boolean): void {
    if (this.pendingToggleInventory) {
      out.toggleInventory = true;
      this.pendingToggleInventory = false;
    }
    if (this.pendingTogglePause) {
      out.togglePause = true;
      this.pendingTogglePause = false;
    }

    if (!activeSource) {
      this.lookAccumX = 0;
      this.lookAccumY = 0;
      this.clearGameplayEdges();
      return;
    }

    out.moveX = this.moveX;
    out.moveY = this.moveY;
    const gain = TOUCH_LOOK_GAIN * this.sensitivity;
    out.lookDeltaX = this.lookAccumX * gain;
    out.lookDeltaY = this.lookAccumY * gain;
    this.lookAccumX = 0;
    this.lookAccumY = 0;

    out.sprint = this.sprintToggled;
    out.crouch = this.crouchToggled;
    out.jumpHeld = this.jumpHeld;
    out.fire = this.fireHeld;
    out.aim = this.aimToggled;

    out.jumpPressed = this.pendingJump;
    out.reload = this.pendingReload;
    out.interact = this.pendingInteract;
    out.vehicleInteract = this.pendingVehicleInteract;
    out.cycleWeapon = this.pendingCycleWeapon;
    out.switchPrimary = this.pendingSwitchPrimary;
    out.switchSecondary = this.pendingSwitchSecondary;
    out.quickHeal = this.pendingQuickHeal;
    out.toggleCamera = this.pendingToggleCamera;

    this.clearGameplayEdges();
  }

  private clearGameplayEdges(): void {
    this.pendingJump = false;
    this.pendingReload = false;
    this.pendingInteract = false;
    this.pendingVehicleInteract = false;
    this.pendingCycleWeapon = false;
    this.pendingSwitchPrimary = false;
    this.pendingSwitchSecondary = false;
    this.pendingQuickHeal = false;
    this.pendingToggleCamera = false;
  }
}
