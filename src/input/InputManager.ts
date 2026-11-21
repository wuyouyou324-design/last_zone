import {
  DeviceCapabilities,
  GameScreen,
  GameSettings,
  InputModeSetting,
  ResolvedInputMode,
} from '../types/game';
import { DeviceDetector } from './DeviceDetector';
import { createEmptyPlayerInput, PlayerInput } from './InputTypes';
import { KeyboardMouseInput } from './KeyboardMouseInput';
import { TouchInput } from './TouchInput';

export interface InputManagerCallbacks {
  onModeChanged: () => void;
  onPointerLockChanged: () => void;
  onUnlockAudio: () => void;
  onToggleInventory: () => void;
  onTogglePause: () => void;
}

export class InputManager {
  public readonly detector: DeviceDetector;
  public readonly keyboardMouse: KeyboardMouseInput;
  public readonly touch: TouchInput;

  private modeSetting: InputModeSetting = 'auto';
  private activeMode: ResolvedInputMode;
  private screen: GameScreen = 'menu';
  private unsubscribeDetector: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    settings: GameSettings,
    private callbacks: InputManagerCallbacks,
  ) {
    this.detector = new DeviceDetector();
    this.modeSetting = settings.inputMode;

    this.keyboardMouse = new KeyboardMouseInput(canvas, {
      onActivity: (viaKeyboard) => {
        this.detector.reportLiveActivity('keyboard-mouse', viaKeyboard);
      },
      onUnlockAudio: () => this.callbacks.onUnlockAudio(),
      onPointerLockChange: () => this.callbacks.onPointerLockChanged(),
      onToggleInventory: () => this.callbacks.onToggleInventory(),
      onTogglePause: () => this.callbacks.onTogglePause(),
    });

    this.touch = new TouchInput(() => {
      this.detector.reportLiveActivity('touch', false);
    });

    this.activeMode = this.detector.resolveMode(this.modeSetting);
    this.syncBackendStates();

    this.unsubscribeDetector = this.detector.subscribe(() => {
      const next = this.detector.resolveMode(this.modeSetting);
      if (next !== this.activeMode) {
        this.activeMode = next;
        this.syncBackendStates();
      }
      this.callbacks.onModeChanged();
    });

    window.addEventListener('pointerdown', this.onGlobalPointerDown, { passive: true });
  }

  private onGlobalPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.detector.reportLiveActivity('touch', false);
    } else if (e.pointerType === 'mouse') {
      this.detector.reportLiveActivity('keyboard-mouse', false);
    }
  };

  public applySettings(settings: GameSettings): void {
    const prevSetting = this.modeSetting;
    this.modeSetting = settings.inputMode;
    this.keyboardMouse.setSensitivity(settings.mouseSensitivity);
    this.touch.setSensitivity(settings.touchSensitivity);

    const nextMode = this.detector.resolveMode(this.modeSetting);
    const modeChanged = nextMode !== this.activeMode || prevSetting !== this.modeSetting;
    this.activeMode = nextMode;
    this.syncBackendStates();

    if (modeChanged) {
      this.callbacks.onModeChanged();
    }
  }

  public setScreen(screen: GameScreen): void {
    this.screen = screen;
    this.keyboardMouse.setScreen(screen);
    if (screen !== 'playing') {
      this.touch.resetContinuousInputs();
    }
  }

  public resetForNewMatch(): void {
    this.keyboardMouse.resetMatchState();
    this.touch.resetMatchState();
  }

  public clearActiveStates(): void {
    this.keyboardMouse.resetContinuousInputs();
    this.touch.resetContinuousInputs();
  }

  public getResolvedMode(): ResolvedInputMode {
    return this.activeMode;
  }

  public getModeSetting(): InputModeSetting {
    return this.modeSetting;
  }

  public getCapabilities(): DeviceCapabilities {
    return this.detector.getCapabilities();
  }

  public isPointerLocked(): boolean {
    return this.keyboardMouse.isPointerLocked();
  }

  public requestPointerLock(): void {
    if (this.activeMode === 'keyboard-mouse') {
      this.keyboardMouse.requestPointerLock();
    }
  }

  public pollInput(): PlayerInput {
    const out = createEmptyPlayerInput();
    this.keyboardMouse.consumeInto(out, this.activeMode === 'keyboard-mouse');
    this.touch.consumeInto(out, this.activeMode === 'touch');
    return out;
  }

  private syncBackendStates(): void {
    this.keyboardMouse.setEnabled(this.activeMode === 'keyboard-mouse');
    this.keyboardMouse.setScreen(this.screen);
    if (this.activeMode !== 'touch') {
      this.touch.resetContinuousInputs();
    }
  }

  public dispose(): void {
    window.removeEventListener('pointerdown', this.onGlobalPointerDown);
    this.unsubscribeDetector();
    this.keyboardMouse.dispose();
    this.detector.dispose();
  }
}
