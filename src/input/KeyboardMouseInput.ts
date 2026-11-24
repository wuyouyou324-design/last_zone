import { GameScreen } from '../types/game';
import { PlayerInput } from './InputTypes';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export interface KeyboardMouseCallbacks {
  onActivity: (viaKeyboard: boolean) => void;
  onUnlockAudio: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onToggleInventory: () => void;
  onTogglePause: () => void;
}

export class KeyboardMouseInput {
  private keys = new Set<string>();
  private crouchToggled = false;
  private crouchHeld = false;
  private mouseFire = false;
  private mouseAim = false;
  private lookAccumX = 0;
  private lookAccumY = 0;

  private pendingJump = false;
  private pendingReload = false;
  private pendingInteract = false;
  private pendingVehicleInteract = false;
  private pendingSwitchPrimary = false;
  private pendingSwitchSecondary = false;
  private pendingQuickHeal = false;
  private pendingToggleCamera = false;
  private pendingToggleInventory = false;
  private pendingTogglePause = false;

  private screen: GameScreen = 'menu';
  private enabled = true;
  private sensitivity = 1.0;

  private pointerLocked = false;
  private pointerLockPending = false;
  private pointerLockRejected = false;
  private lastPointerLockExitAt = 0;
  private lastPointerLockReqAt = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: KeyboardMouseCallbacks,
  ) {
    this.bindEvents();
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.resetContinuousInputs();
      this.exitPointerLock();
    }
  }

  public setScreen(screen: GameScreen): void {
    this.screen = screen;
    if (screen !== 'playing') {
      this.resetContinuousInputs();
      this.exitPointerLock();
    }
  }

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  public isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  public requestPointerLock(): void {
    if (!this.enabled || this.screen !== 'playing') return;
    if (!this.canvas || typeof this.canvas.requestPointerLock !== 'function') return;
    if (document.pointerLockElement === this.canvas || this.pointerLockPending) return;

    const now = performance.now();
    if (now - this.lastPointerLockExitAt < 200 || now - this.lastPointerLockReqAt < 200) {
      return;
    }

    this.lastPointerLockReqAt = now;
    this.pointerLockPending = true;
    try {
      const maybePromise = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          () => {
            this.pointerLockPending = false;
            this.pointerLockRejected = false;
          },
          () => {
            this.pointerLockPending = false;
            this.pointerLockRejected = true;
          },
        );
      } else {
        this.pointerLockPending = false;
      }
    } catch {
      this.pointerLockPending = false;
      this.pointerLockRejected = true;
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      this.lastPointerLockExitAt = performance.now();
      try {
        document.exitPointerLock();
      } catch {
        // Ignore exitPointerLock errors
      }
    }
  }

  public resetMatchState(): void {
    this.crouchToggled = false;
    this.crouchHeld = false;
    this.resetContinuousInputs();
  }

  public resetContinuousInputs(): void {
    this.keys.clear();
    this.crouchHeld = false;
    this.mouseFire = false;
    this.mouseAim = false;
    this.lookAccumX = 0;
    this.lookAccumY = 0;
  }

  public consumeInto(out: PlayerInput, activeSource: boolean): void {
    // Always consume navigation toggles so Tab/Esc work regardless of active pointer mode
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

    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const backward = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;

    out.moveX = right - left;
    out.moveY = forward - backward;
    out.lookDeltaX = this.lookAccumX * this.sensitivity;
    out.lookDeltaY = this.lookAccumY * this.sensitivity;
    this.lookAccumX = 0;
    this.lookAccumY = 0;

    out.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    out.crouch = this.crouchHeld || this.crouchToggled;
    out.jumpHeld = this.keys.has('Space');
    out.fire = this.mouseFire;
    out.aim = this.mouseAim;

    out.jumpPressed = this.pendingJump;
    out.reload = this.pendingReload;
    out.interact = this.pendingInteract;
    out.vehicleInteract = this.pendingVehicleInteract;
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
    this.pendingSwitchPrimary = false;
    this.pendingSwitchSecondary = false;
    this.pendingQuickHeal = false;
    this.pendingToggleCamera = false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isEditableElement(document.activeElement) || isEditableElement(e.target)) {
      return;
    }

    // Physical keyboard presence is useful for hybrid device detection
    if (
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD' ||
      e.code === 'Space' ||
      e.code === 'ShiftLeft' ||
      e.code === 'ControlLeft'
    ) {
      this.callbacks.onActivity(true);
    }

    if (e.code === 'Tab' || e.code === 'KeyI') {
      if (this.screen === 'playing' || this.screen === 'inventory') {
        e.preventDefault();
        if (!e.repeat) {
          this.pendingToggleInventory = false;
          this.callbacks.onToggleInventory();
        }
      }
      return;
    }

    if (e.code === 'Escape') {
      if (this.screen === 'playing' || this.screen === 'inventory' || this.screen === 'paused') {
        if (!e.repeat) {
          this.pendingTogglePause = false;
          this.callbacks.onTogglePause();
        }
      }
      return;
    }

    if (this.screen !== 'playing' || !this.enabled) return;

    // Avoid interfering with browser Alt/Meta shortcuts
    if (e.altKey || e.metaKey) return;

    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    this.keys.add(e.code);

    switch (e.code) {
      case 'Space':
        if (!e.repeat) this.pendingJump = true;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.crouchHeld = true;
        break;
      case 'KeyC':
        if (!e.repeat) this.crouchToggled = !this.crouchToggled;
        break;
      case 'KeyV':
        if (!e.repeat) this.pendingToggleCamera = true;
        break;
      case 'KeyF':
        if (!e.repeat) this.pendingInteract = true;
        break;
      case 'KeyE':
        if (!e.repeat) this.pendingVehicleInteract = true;
        break;
      case 'KeyR':
        if (!e.repeat) this.pendingReload = true;
        break;
      case 'Digit1':
        if (!e.repeat) this.pendingSwitchPrimary = true;
        break;
      case 'Digit2':
        if (!e.repeat) this.pendingSwitchSecondary = true;
        break;
      case 'Digit3':
        if (!e.repeat) this.pendingQuickHeal = true;
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      this.crouchHeld = false;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled || this.screen !== 'playing') return;
    const fallbackDragLook = !this.pointerLocked && this.pointerLockRejected && (e.buttons & 2) !== 0;
    if (!this.pointerLocked && !fallbackDragLook) return;
    this.lookAccumX += e.movementX;
    this.lookAccumY += e.movementY;
  };

  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    this.callbacks.onActivity(false);
    if (!this.enabled || this.screen !== 'playing') return;

    this.callbacks.onUnlockAudio();
    if (!this.pointerLocked) {
      this.requestPointerLock();
      if (!this.pointerLockRejected) {
        return;
      }
    }

    if (e.button === 0) {
      this.mouseFire = true;
    } else if (e.button === 2) {
      this.mouseAim = true;
    }
  };

  private onWindowPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0) this.mouseFire = false;
    if (e.button === 2) this.mouseAim = false;
  };

  private onPointerLockChange = (): void => {
    this.pointerLockPending = false;
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.pointerLocked) {
      this.pointerLockRejected = false;
    } else if (wasLocked) {
      this.lastPointerLockExitAt = performance.now();
    }
    if (!this.pointerLocked && this.screen === 'playing') {
      this.mouseFire = false;
      this.mouseAim = false;
    }
    this.callbacks.onPointerLockChange(this.pointerLocked);
  };

  private onPointerLockError = (): void => {
    this.pointerLockPending = false;
    this.pointerLockRejected = true;
  };

  private onBlur = (): void => {
    this.resetContinuousInputs();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.resetContinuousInputs();
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
