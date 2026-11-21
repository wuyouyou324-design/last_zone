import React, { useEffect, useRef, useState } from 'react';
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

  const [fireActive, setFireActive] = useState(false);
  const [aimActive, setAimActive] = useState(hud.isAiming);

  useEffect(() => {
    setAimActive(hud.isAiming);
  }, [hud.isAiming]);

  useEffect(() => {
    if (hud.screen !== 'playing') {
      cameraPointerIdRef.current = null;
      firePointerIdRef.current = null;
      setFireActive(false);
    }
  }, [hud.screen]);

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
          aria-label="Switch Camera 1P/3P"
          className="h-11 min-w-11 px-2.5 bg-[#0F1318]/88 border border-white/15 text-slate-200 active:bg-white/15 flex items-center justify-center gap-1 text-xs font-mono-tabular font-semibold cursor-pointer touch-gameplay-surface"
        >
          <Eye className="w-4 h-4 text-amber-400" />
          <span>{hud.cameraMode === 'first-person' ? '1P' : '3P'}</span>
        </button>

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

      {/* Contextual Interact / Collect Loot Button */}
      {hud.lootPrompt && (
        <div
          className={`fixed z-20 pointer-events-auto ${
            compactLandscape
              ? 'bottom-[154px] right-[calc(env(safe-area-inset-right,0px)+16px)]'
              : !isLandscape
                ? 'bottom-[232px] right-[calc(env(safe-area-inset-right,0px)+14px)]'
                : 'bottom-[198px] right-[calc(env(safe-area-inset-right,0px)+16px)]'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
        >
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
    </div>
  );
};
