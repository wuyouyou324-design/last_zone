import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Target,
  ArrowUp,
  RotateCw,
  Eye,
  HeartPulse,
  Package,
  Pause,
  Hand,
  ArrowLeftRight,
  Car,
  ChevronLeft,
  ChevronRight,
  LogOut,
  OctagonAlert,
} from 'lucide-react';
import { TouchInput } from '../input/TouchInput';
import { HudSnapshot } from '../types/game';
import { VirtualJoystick } from './VirtualJoystick';

interface TouchControlsUIProps {
  hud: HudSnapshot;
  touchInput: TouchInput;
  onOpenInventory: () => void;
  onPause: () => void;
}

export const TouchControlsUI: React.FC<TouchControlsUIProps> = ({
  hud,
  touchInput,
  onOpenInventory,
  onPause,
}) => {
  const cameraPointerIdRef = useRef<number | null>(null);
  const lastCameraPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const firePointerIdRef = useRef<number | null>(null);

  const steerLeftPtrRef = useRef<number | null>(null);
  const steerRightPtrRef = useRef<number | null>(null);
  const gasPtrRef = useRef<number | null>(null);
  const brakePtrRef = useRef<number | null>(null);
  const handbrakePtrRef = useRef<number | null>(null);

  const [fireActive, setFireActive] = useState(false);
  const [aimActive, setAimActive] = useState(hud.isAiming);
  const [driveUiState, setDriveUiState] = useState({
    left: false,
    right: false,
    gas: false,
    brake: false,
    handbrake: false,
  });

  const isDriving = hud.activeVehicle !== null;

  const syncDrivingControls = useCallback(() => {
    const left = steerLeftPtrRef.current !== null;
    const right = steerRightPtrRef.current !== null;
    const gas = gasPtrRef.current !== null;
    const brake = brakePtrRef.current !== null;
    const handbrake = handbrakePtrRef.current !== null;

    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    const throttle = (gas ? 1 : 0) - (brake ? 1 : 0);
    touchInput.setDrivingControls(steer, throttle, handbrake);
    setDriveUiState({ left, right, gas, brake, handbrake });
  }, [touchInput]);

  const clearDrivingHolds = useCallback(() => {
    steerLeftPtrRef.current = null;
    steerRightPtrRef.current = null;
    gasPtrRef.current = null;
    brakePtrRef.current = null;
    handbrakePtrRef.current = null;
    touchInput.setDrivingControls(0, 0, false);
    setDriveUiState({
      left: false,
      right: false,
      gas: false,
      brake: false,
      handbrake: false,
    });
  }, [touchInput]);

  useEffect(() => {
    setAimActive(hud.isAiming);
  }, [hud.isAiming]);

  useEffect(() => {
    if (hud.screen !== 'playing' || !isDriving) {
      if (!isDriving) {
        clearDrivingHolds();
      }
    }
    if (hud.screen !== 'playing') {
      cameraPointerIdRef.current = null;
      firePointerIdRef.current = null;
      setFireActive(false);
      clearDrivingHolds();
    }
  }, [hud.screen, isDriving, clearDrivingHolds]);

  useEffect(() => {
    return () => {
      clearDrivingHolds();
    };
  }, [clearDrivingHolds]);

  const isLandscape = hud.deviceCapabilities.orientation === 'landscape';
  const compactLandscape = isLandscape && hud.deviceCapabilities.viewportHeight < 500;

  // Camera touch-drag surface handlers (right half behind action buttons)
  const onCameraPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (hud.screen !== 'playing') return;
    if (cameraPointerIdRef.current !== null) return;
    cameraPointerIdRef.current = e.pointerId;
    lastCameraPosRef.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors in synthetic test environments
    }
  };

  const onCameraPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraPointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - lastCameraPosRef.current.x;
    const dy = e.clientY - lastCameraPosRef.current.y;
    lastCameraPosRef.current = { x: e.clientX, y: e.clientY };
    if (dx !== 0 || dy !== 0) {
      touchInput.addLookDelta(dx, dy);
    }
  };

  const onCameraPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraPointerIdRef.current !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }
    cameraPointerIdRef.current = null;
  };

  // Holdable Fire button with pointerId isolation
  const onFirePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (firePointerIdRef.current !== null) return;
    firePointerIdRef.current = e.pointerId;
    setFireActive(true);
    touchInput.setFire(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const onFirePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (firePointerIdRef.current !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
    firePointerIdRef.current = null;
    setFireActive(false);
    touchInput.setFire(false);
  };

  const activeWeapon =
    hud.equipped.activeSlot === 'primary' ? hud.equipped.primary : hud.equipped.secondary;
  const activeSlotLabel = hud.equipped.activeSlot === 'primary' ? '1' : '2';
  const medicalCount = hud.inventory
    .filter((i) => i.category === 'medical')
    .reduce((acc, i) => acc + i.quantity, 0);

  if (hud.screen !== 'playing') return null;

  return (
    <div
      data-testid="touch-controls-root"
      className="fixed inset-0 z-20 pointer-events-none select-none safe-area-hud"
    >
      {/* Dedicated Right-Side Camera Touch-Drag Zone (sits below z-20 buttons) */}
      <div
        data-testid="touch-camera-zone"
        aria-label="Camera Look Area"
        onPointerDown={onCameraPointerDown}
        onPointerMove={onCameraPointerMove}
        onPointerUp={onCameraPointerEnd}
        onPointerCancel={onCameraPointerEnd}
        onLostPointerCapture={onCameraPointerEnd}
        className="fixed top-0 right-0 bottom-0 left-[38%] z-10 pointer-events-auto touch-gameplay-surface"
      />

      {/* Top-Right Compact Utility Row: Camera 1P/3P, Quick Heal, Bag, Pause */}
      <div
        className={`fixed z-20 pointer-events-auto flex items-center gap-1.5 touch-gameplay-surface ${
          compactLandscape
            ? 'top-[54px] right-[calc(env(safe-area-inset-right,0px)+10px)]'
            : 'top-[106px] right-[calc(env(safe-area-inset-right,0px)+12px)]'
        }`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          data-testid="touch-camera-btn"
          onPointerDown={(e) => {
            e.stopPropagation();
            touchInput.triggerToggleCamera();
          }}
          aria-label={isDriving ? 'Cycle Driving Camera Zoom' : 'Switch Camera 1P/3P'}
          className="h-11 min-w-11 px-2.5 bg-[#0F1318]/88 border border-white/15 text-slate-200 active:bg-white/15 flex items-center justify-center gap-1 text-xs font-mono-tabular font-semibold cursor-pointer touch-gameplay-surface"
        >
          <Eye className="w-4 h-4 text-amber-400" />
          <span>
            {isDriving && hud.activeVehicle
              ? `CAM ${hud.activeVehicle.cameraZoomIndex + 1}`
              : hud.cameraMode === 'first-person'
                ? '1P'
                : '3P'}
          </span>
        </button>

        {!isDriving && (
          <button
            type="button"
            data-testid="touch-heal-btn"
            disabled={medicalCount === 0}
            onPointerDown={(e) => {
              e.stopPropagation();
              touchInput.triggerQuickHeal();
            }}
            aria-label="Quick Heal"
            className="h-11 min-w-11 px-2.5 bg-[#0F1318]/88 border border-white/15 disabled:opacity-45 text-slate-200 active:bg-emerald-500/30 flex items-center justify-center gap-1 text-xs font-mono-tabular font-semibold cursor-pointer touch-gameplay-surface"
          >
            <HeartPulse className="w-4 h-4 text-emerald-400" />
            <span>{medicalCount}</span>
          </button>
        )}

        <button
          type="button"
          data-testid="touch-inventory-btn"
          onPointerDown={(e) => {
            e.stopPropagation();
            onOpenInventory();
          }}
          aria-label="Open Inventory"
          className="h-11 min-w-11 px-2.5 bg-[#0F1318]/88 border border-white/15 text-slate-200 active:bg-white/15 flex items-center justify-center gap-1 text-xs font-medium cursor-pointer touch-gameplay-surface"
        >
          <Package className="w-4 h-4 text-amber-400" />
          <span>Bag</span>
        </button>

        <button
          type="button"
          data-testid="touch-pause-btn"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPause();
          }}
          aria-label="Pause Match"
          className="h-11 w-11 bg-[#0F1318]/88 border border-white/15 text-slate-200 active:bg-white/15 flex items-center justify-center cursor-pointer touch-gameplay-surface"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {isDriving ? (
        <div data-testid="touch-driving-controls" className="contents">
          {/* Bottom-Left: Ergonomic Steer Left / Right Buttons */}
          <div
            className={`fixed z-20 pointer-events-auto flex items-center gap-2.5 touch-gameplay-surface ${
              compactLandscape
                ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] left-[calc(env(safe-area-inset-left,0px)+14px)]'
                : 'bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] left-[calc(env(safe-area-inset-left,0px)+14px)]'
            }`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="touch-steer-left-btn"
              aria-label="Steer Left"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (steerLeftPtrRef.current !== null) return;
                steerLeftPtrRef.current = e.pointerId;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore
                }
                syncDrivingControls();
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (steerLeftPtrRef.current !== e.pointerId) return;
                steerLeftPtrRef.current = null;
                syncDrivingControls();
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                if (steerLeftPtrRef.current !== e.pointerId) return;
                steerLeftPtrRef.current = null;
                syncDrivingControls();
              }}
              onLostPointerCapture={() => {
                steerLeftPtrRef.current = null;
                syncDrivingControls();
              }}
              className={`${
                compactLandscape ? 'w-16 h-16' : 'w-[70px] h-[70px]'
              } border-2 flex items-center justify-center cursor-pointer touch-gameplay-surface ${
                driveUiState.left
                  ? 'bg-sky-500 border-sky-300 text-slate-950 scale-95'
                  : 'bg-[#0F1318]/90 border-white/18 text-slate-100'
              }`}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button
              type="button"
              data-testid="touch-steer-right-btn"
              aria-label="Steer Right"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (steerRightPtrRef.current !== null) return;
                steerRightPtrRef.current = e.pointerId;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore
                }
                syncDrivingControls();
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (steerRightPtrRef.current !== e.pointerId) return;
                steerRightPtrRef.current = null;
                syncDrivingControls();
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                if (steerRightPtrRef.current !== e.pointerId) return;
                steerRightPtrRef.current = null;
                syncDrivingControls();
              }}
              onLostPointerCapture={() => {
                steerRightPtrRef.current = null;
                syncDrivingControls();
              }}
              className={`${
                compactLandscape ? 'w-16 h-16' : 'w-[70px] h-[70px]'
              } border-2 flex items-center justify-center cursor-pointer touch-gameplay-surface ${
                driveUiState.right
                  ? 'bg-sky-500 border-sky-300 text-slate-950 scale-95'
                  : 'bg-[#0F1318]/90 border-white/18 text-slate-100'
              }`}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>

          {/* Bottom-Right: Exit, Handbrake, Brake/Reverse, Gas */}
          <div
            className={`fixed z-20 pointer-events-auto flex flex-col items-end gap-2 touch-gameplay-surface ${
              compactLandscape
                ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] right-[calc(env(safe-area-inset-right,0px)+14px)]'
                : 'bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] right-[calc(env(safe-area-inset-right,0px)+14px)]'
            }`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="touch-exit-vehicle-btn"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  clearDrivingHolds();
                  touchInput.triggerVehicleInteract();
                }}
                aria-label="Exit Vehicle"
                className="h-11 px-3 bg-red-950/90 active:bg-red-600 border border-red-400/60 text-red-100 font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer touch-gameplay-surface"
              >
                <LogOut className="w-4 h-4" />
                <span>EXIT</span>
              </button>

              <button
                type="button"
                data-testid="touch-handbrake-btn"
                aria-label="Handbrake"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (handbrakePtrRef.current !== null) return;
                  handbrakePtrRef.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore
                  }
                  syncDrivingControls();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (handbrakePtrRef.current !== e.pointerId) return;
                  handbrakePtrRef.current = null;
                  syncDrivingControls();
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  if (handbrakePtrRef.current !== e.pointerId) return;
                  handbrakePtrRef.current = null;
                  syncDrivingControls();
                }}
                onLostPointerCapture={() => {
                  handbrakePtrRef.current = null;
                  syncDrivingControls();
                }}
                className={`h-11 px-3 border font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer touch-gameplay-surface ${
                  driveUiState.handbrake
                    ? 'bg-amber-500 border-amber-300 text-slate-950'
                    : 'bg-[#0F1318]/90 border-white/18 text-slate-200'
                }`}
              >
                <OctagonAlert className="w-4 h-4" />
                <span>PARK</span>
              </button>
            </div>

            <div className="flex items-end gap-2.5">
              <button
                type="button"
                data-testid="touch-brake-btn"
                aria-label="Brake or Reverse"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (brakePtrRef.current !== null) return;
                  brakePtrRef.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore
                  }
                  syncDrivingControls();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (brakePtrRef.current !== e.pointerId) return;
                  brakePtrRef.current = null;
                  syncDrivingControls();
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  if (brakePtrRef.current !== e.pointerId) return;
                  brakePtrRef.current = null;
                  syncDrivingControls();
                }}
                onLostPointerCapture={() => {
                  brakePtrRef.current = null;
                  syncDrivingControls();
                }}
                className={`${
                  compactLandscape ? 'w-16 h-16' : 'w-[68px] h-[68px]'
                } border-2 font-display font-bold text-[11px] flex flex-col items-center justify-center cursor-pointer touch-gameplay-surface ${
                  driveUiState.brake
                    ? 'bg-red-500 border-red-300 text-white scale-95'
                    : 'bg-[#0F1318]/90 border-red-400/50 text-red-200'
                }`}
              >
                <span>BRAKE</span>
                <span className="text-[9px] opacity-75">REV</span>
              </button>

              <button
                type="button"
                data-testid="touch-gas-btn"
                aria-label="Accelerate"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (gasPtrRef.current !== null) return;
                  gasPtrRef.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore
                  }
                  syncDrivingControls();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (gasPtrRef.current !== e.pointerId) return;
                  gasPtrRef.current = null;
                  syncDrivingControls();
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  if (gasPtrRef.current !== e.pointerId) return;
                  gasPtrRef.current = null;
                  syncDrivingControls();
                }}
                onLostPointerCapture={() => {
                  gasPtrRef.current = null;
                  syncDrivingControls();
                }}
                className={`${
                  compactLandscape ? 'w-16 h-20' : 'w-[72px] h-[84px]'
                } border-2 font-display font-bold text-xs flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-gameplay-surface ${
                  driveUiState.gas
                    ? 'bg-emerald-400 border-emerald-200 text-slate-950 scale-95'
                    : 'bg-emerald-500/85 border-emerald-300 text-slate-950'
                }`}
              >
                <ArrowUp className="w-5 h-5" />
                <span>GAS</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Bottom-Left: Virtual Joystick + Sprint */}
          <div
            className={`fixed z-20 ${
              compactLandscape
                ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] left-[calc(env(safe-area-inset-left,0px)+14px)]'
                : 'bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-[calc(env(safe-area-inset-left,0px)+14px)]'
            }`}
          >
            <VirtualJoystick
              touchInput={touchInput}
              isSprinting={hud.isSprinting}
              compact={compactLandscape}
            />
          </div>

          {/* Contextual Vehicle Entry & Loot Collect Prompts */}
          {(hud.lootPrompt ||
            (hud.vehiclePrompt && !hud.vehiclePrompt.disabled && !hud.vehiclePrompt.occupied)) && (
            <div
              className={`fixed z-20 pointer-events-auto flex flex-col items-end gap-2 ${
                compactLandscape
                  ? 'bottom-[154px] right-[calc(env(safe-area-inset-right,0px)+16px)]'
                  : !isLandscape
                    ? 'bottom-[232px] right-[calc(env(safe-area-inset-right,0px)+14px)]'
                    : 'bottom-[198px] right-[calc(env(safe-area-inset-right,0px)+16px)]'
              }`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {hud.vehiclePrompt && !hud.vehiclePrompt.disabled && !hud.vehiclePrompt.occupied && (
                <button
                  type="button"
                  data-testid="touch-enter-vehicle-btn"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    touchInput.triggerVehicleInteract();
                  }}
                  className="h-11 px-3.5 bg-sky-500 active:bg-sky-400 border border-sky-300 text-slate-950 font-display font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer touch-gameplay-surface"
                >
                  <Car className="w-4 h-4" />
                  <span className="truncate max-w-[148px]">
                    Drive {hud.vehiclePrompt.name}
                  </span>
                </button>
              )}

              {hud.lootPrompt && (
                <button
                  type="button"
                  data-testid="touch-interact-btn"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    touchInput.triggerInteract();
                  }}
                  className="h-11 px-3.5 bg-amber-500 active:bg-amber-400 border border-amber-300 text-slate-950 font-display font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer touch-gameplay-surface"
                >
                  <Hand className="w-4 h-4" />
                  <span className="truncate max-w-[140px]">
                    Loot {hud.lootPrompt.name}
                  </span>
                </button>
              )}
            </div>
          )}

      {/* Bottom-Right: Tactical Combat Action Cluster */}
      <div
        className={`fixed z-20 pointer-events-auto flex flex-col items-end gap-2 touch-gameplay-surface ${
          compactLandscape
            ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] right-[calc(env(safe-area-inset-right,0px)+14px)]'
            : 'bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-[calc(env(safe-area-inset-right,0px)+14px)]'
        }`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Top Row of Cluster: Weapon Switch & Reload */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="touch-weapon-btn"
            onPointerDown={(e) => {
              e.stopPropagation();
              touchInput.triggerCycleWeapon();
            }}
            aria-label="Switch Weapon"
            className="h-11 px-2.5 bg-[#0F1318]/90 border border-white/15 active:border-amber-400 text-slate-100 flex items-center gap-1.5 text-xs font-mono-tabular cursor-pointer touch-gameplay-surface"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
            <span className="max-w-[74px] truncate">
              [{activeSlotLabel}] {activeWeapon ? activeWeapon.name.split(' ')[0] : 'Gun'}
            </span>
          </button>

          <button
            type="button"
            data-testid="touch-reload-btn"
            onPointerDown={(e) => {
              e.stopPropagation();
              touchInput.triggerReload();
            }}
            aria-label="Reload Weapon"
            className={`w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer touch-gameplay-surface ${
              hud.reloading
                ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                : 'bg-[#0F1318]/90 border-white/15 text-slate-200 active:bg-white/15'
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Secondary Row on Portrait (Aim & Jump) to leave wide horizontal clearance from joystick */}
        {!isLandscape && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="touch-aim-btn"
              aria-pressed={aimActive}
              onPointerDown={(e) => {
                e.stopPropagation();
                const next = touchInput.toggleAim();
                setAimActive(next);
              }}
              className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center text-[10px] font-display font-semibold cursor-pointer touch-gameplay-surface ${
                aimActive
                  ? 'bg-amber-500 border-amber-300 text-slate-950'
                  : 'bg-[#0F1318]/90 border-white/18 text-slate-200 active:bg-white/15'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>AIM</span>
            </button>

            <button
              type="button"
              data-testid="touch-jump-btn"
              onPointerDown={(e) => {
                e.stopPropagation();
                touchInput.triggerJump(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                touchInput.releaseJump();
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                touchInput.releaseJump();
              }}
              className="w-12 h-12 rounded-full border border-white/18 bg-[#0F1318]/90 active:bg-amber-500 active:text-slate-950 text-slate-200 flex flex-col items-center justify-center text-[10px] font-display font-semibold cursor-pointer touch-gameplay-surface"
            >
              <ArrowUp className="w-4 h-4" />
              <span>JUMP</span>
            </button>
          </div>
        )}

        {/* Main Thumb Row: Landscape shows Crouch+Aim+Jump+Fire; Portrait shows Crouch+Fire */}
        <div className="flex items-end gap-2">
          <button
            type="button"
            data-testid="touch-crouch-btn"
            aria-pressed={hud.isCrouching}
            onPointerDown={(e) => {
              e.stopPropagation();
              touchInput.toggleCrouch();
            }}
            className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center text-[10px] font-display font-semibold cursor-pointer touch-gameplay-surface ${
              hud.isCrouching
                ? 'bg-amber-500 border-amber-300 text-slate-950'
                : 'bg-[#0F1318]/90 border-white/18 text-slate-200 active:bg-white/15'
            }`}
          >
            <span>CROUCH</span>
          </button>

          {isLandscape && (
            <>
              <button
                type="button"
                data-testid="touch-aim-btn"
                aria-pressed={aimActive}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const next = touchInput.toggleAim();
                  setAimActive(next);
                }}
                className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center text-[10px] font-display font-semibold cursor-pointer touch-gameplay-surface ${
                  aimActive
                    ? 'bg-amber-500 border-amber-300 text-slate-950'
                    : 'bg-[#0F1318]/90 border-white/18 text-slate-200 active:bg-white/15'
                }`}
              >
                <Target className="w-4 h-4" />
                <span>AIM</span>
              </button>

              <button
                type="button"
                data-testid="touch-jump-btn"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  touchInput.triggerJump(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  touchInput.releaseJump();
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  touchInput.releaseJump();
                }}
                className="w-12 h-12 rounded-full border border-white/18 bg-[#0F1318]/90 active:bg-amber-500 active:text-slate-950 text-slate-200 flex flex-col items-center justify-center text-[10px] font-display font-semibold cursor-pointer touch-gameplay-surface"
              >
                <ArrowUp className="w-4 h-4" />
                <span>JUMP</span>
              </button>
            </>
          )}

          {/* Primary Holdable Fire Trigger */}
          <button
            type="button"
            data-testid="touch-fire-btn"
            onPointerDown={onFirePointerDown}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={onFirePointerEnd}
            onPointerCancel={onFirePointerEnd}
            onLostPointerCapture={onFirePointerEnd}
            className={`${
              compactLandscape ? 'w-16 h-16' : 'w-[68px] h-[68px]'
            } rounded-full border-2 flex flex-col items-center justify-center gap-0.5 font-display font-bold text-[11px] tracking-wide shadow-lg cursor-pointer touch-gameplay-surface ${
              fireActive
                ? 'bg-red-500 border-amber-200 text-white scale-95'
                : 'bg-amber-500/92 border-amber-300 text-slate-950'
            }`}
          >
            <Crosshair className="w-5 h-5" />
            <span>FIRE</span>
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
