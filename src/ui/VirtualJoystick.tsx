import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { TouchInput } from '../input/TouchInput';

interface VirtualJoystickProps {
  touchInput: TouchInput;
  isSprinting: boolean;
  compact?: boolean;
}

const DEADZONE = 0.1;

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  touchInput,
  isSprinting,
  compact = false,
}) => {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [engaged, setEngaged] = useState(false);
  const [sprintLocked, setSprintLocked] = useState(false);

  useEffect(() => {
    setSprintLocked(touchInput.isSprintActive());
  }, [isSprinting, touchInput]);

  const outerSize = compact ? 108 : 122;
  const knobSize = compact ? 42 : 48;
  const maxRadius = (outerSize - knobSize) * 0.5 + 8;

  const setKnobOffset = (dx: number, dy: number) => {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }
  };

  const resetStick = () => {
    activePointerIdRef.current = null;
    setEngaged(false);
    setKnobOffset(0, 0);
    touchInput.setMoveVector(0, 0);
  };

  useEffect(() => {
    const onBlur = () => resetStick();
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      touchInput.setMoveVector(0, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchInput]);

  const updateFromClientPos = (clientX: number, clientY: number) => {
    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    const dist = Math.hypot(dx, dy);

    let clampedX = dx;
    let clampedY = dy;
    if (dist > maxRadius && dist > 0.001) {
      const scale = maxRadius / dist;
      clampedX = dx * scale;
      clampedY = dy * scale;
    }

    setKnobOffset(clampedX, clampedY);

    const normDist = Math.min(1, dist / maxRadius);
    if (normDist < DEADZONE) {
      touchInput.setMoveVector(0, 0);
      return;
    }

    const rescaled = (normDist - DEADZONE) / (1 - DEADZONE);
    const dirX = dist > 0.001 ? dx / dist : 0;
    const dirY = dist > 0.001 ? dy / dist : 0;

    // Screen Y down is negative forward movement (+Y forward, -Y backward)
    touchInput.setMoveVector(dirX * rescaled, -dirY * rescaled);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerIdRef.current !== null) return;

    const base = baseRef.current;
    if (!base) return;

    const rect = base.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    activePointerIdRef.current = e.pointerId;
    setEngaged(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors in synthetic pointer environments
    }
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerIdRef.current !== e.pointerId) return;
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerIdRef.current !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }
    resetStick();
  };

  const handleSprintToggle = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const next = touchInput.toggleSprint();
    setSprintLocked(next);
  };

  return (
    <div
      className="pointer-events-auto flex flex-col items-start gap-2 select-none touch-gameplay-surface"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Dedicated Sprint Toggle Button */}
      <button
        type="button"
        data-testid="touch-sprint-btn"
        aria-pressed={sprintLocked}
        onPointerDown={handleSprintToggle}
        className={`h-10 px-3 border flex items-center gap-1.5 text-xs font-display font-semibold tracking-wide transition-colors cursor-pointer touch-gameplay-surface ${
          sprintLocked
            ? 'bg-amber-500 border-amber-300 text-slate-950'
            : 'bg-[#0F1318]/88 border-white/15 text-slate-200 active:bg-white/15'
        }`}
      >
        <Zap className="w-3.5 h-3.5" />
        <span>SPRINT</span>
      </button>

      {/* Analog Virtual Joystick */}
      <div
        ref={baseRef}
        data-testid="virtual-joystick"
        role="application"
        aria-label="Movement Joystick"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onLostPointerCapture={handlePointerUpOrCancel}
        style={{ width: outerSize, height: outerSize }}
        className={`relative rounded-full border-2 flex items-center justify-center transition-colors touch-gameplay-surface ${
          engaged
            ? 'bg-[#0F1318]/85 border-amber-400/70'
            : 'bg-[#0F1318]/72 border-white/20'
        }`}
      >
        {/* Crosshair Axis Guides */}
        <span className="pointer-events-none absolute inset-x-4 top-1/2 h-px bg-white/10" />
        <span className="pointer-events-none absolute inset-y-4 left-1/2 w-px bg-white/10" />
        <span className="pointer-events-none absolute w-1/2 h-1/2 rounded-full border border-white/10" />

        {/* Thumb Knob */}
        <div
          ref={knobRef}
          data-testid="virtual-joystick-knob"
          style={{ width: knobSize, height: knobSize }}
          className={`pointer-events-none rounded-full border-2 shadow-lg transition-colors ${
            engaged
              ? 'bg-amber-400/90 border-amber-200'
              : 'bg-slate-200/80 border-white/60'
          }`}
        />
      </div>
    </div>
  );
};
