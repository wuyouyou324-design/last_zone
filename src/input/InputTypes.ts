export interface PlayerInput {
  /** Analog lateral movement: -1 (left) to +1 (right) */
  moveX: number;
  /** Analog forward movement: -1 (backward) to +1 (forward) */
  moveY: number;
  /** Frame-accumulated horizontal look delta in normalized mouse-pixel equivalents */
  lookDeltaX: number;
  /** Frame-accumulated vertical look delta in normalized mouse-pixel equivalents */
  lookDeltaY: number;
  /** Continuous movement & combat states */
  sprint: boolean;
  crouch: boolean;
  jumpHeld: boolean;
  fire: boolean;
  aim: boolean;
  /** One-shot edge triggers consumed once per simulation update */
  jumpPressed: boolean;
  reload: boolean;
  interact: boolean;
  switchPrimary: boolean;
  switchSecondary: boolean;
  cycleWeapon: boolean;
  quickHeal: boolean;
  toggleCamera: boolean;
  toggleInventory: boolean;
  togglePause: boolean;
}

export function createEmptyPlayerInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    sprint: false,
    crouch: false,
    jumpHeld: false,
    fire: false,
    aim: false,
    jumpPressed: false,
    reload: false,
    interact: false,
    switchPrimary: false,
    switchSecondary: false,
    cycleWeapon: false,
    quickHeal: false,
    toggleCamera: false,
    toggleInventory: false,
    togglePause: false,
  };
}
