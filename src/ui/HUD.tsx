import React, { useEffect, useRef } from 'react';
import { Shield, Eye, Package, HeartPulse } from 'lucide-react';
import { TouchInput } from '../input/TouchInput';
import { HudSnapshot } from '../types/game';
import { ISLAND_SIZE } from '../world/Terrain';
import { TouchControlsUI } from './TouchControlsUI';

interface HUDProps {
  hud: HudSnapshot;
  minimapSource: HTMLCanvasElement | null;
  touchInput: TouchInput | null;
  showFps: boolean;
  onRequestLock: () => void;
  onOpenInventory: () => void;
  onPause: () => void;
}

const COMPASS_LABELS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

function shortestAngleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

export const HUD: React.FC<HUDProps> = ({
  hud,
  minimapSource,
  touchInput,
  showFps,
  onRequestLock,
  onOpenInventory,
  onPause,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const isTouchLayout = hud.inputMode === 'touch';
  const isTouchLandscape =
    isTouchLayout && hud.deviceCapabilities.orientation === 'landscape';
  const isCompactLandscape =
    isTouchLandscape && hud.deviceCapabilities.viewportHeight < 500;

  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    if (minimapSource) {
      ctx.drawImage(minimapSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#18222C';
      ctx.fillRect(0, 0, size, size);
    }

    const toPx = (wx: number, wz: number): [number, number] => [
      (wx / ISLAND_SIZE + 0.5) * size,
      (wz / ISLAND_SIZE + 0.5) * size,
    ];
    const scaleRadius = (r: number): number => (r / ISLAND_SIZE) * size;

    // Next Target Safe Zone (dashed white circle)
    const [tx, tz] = toPx(hud.safeZone.targetCenterX, hud.safeZone.targetCenterZ);
    ctx.save();
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.78)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(tx, tz, scaleRadius(hud.safeZone.targetRadius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Current Safe Zone Storm Ring (crisp sky blue)
    const [cx, cz] = toPx(hud.safeZone.currentCenterX, hud.safeZone.currentCenterZ);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cz, scaleRadius(hud.safeZone.currentRadius), 0, Math.PI * 2);
    ctx.stroke();

    // Gunfire acoustic blips
    for (const blip of hud.minimapBlips) {
      const [bx, bz] = toPx(blip.x, blip.z);
      ctx.fillStyle = `rgba(239, 68, 68, ${blip.alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(bx, bz, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player heading triangle
    const [px, pz] = toPx(hud.playerX, hud.playerZ);
    const rad = (hud.playerYawDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(rad);
    ctx.fillStyle = '#F59E0B';
    ctx.strokeStyle = '#0F1318';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [hud, minimapSource]);

  const activeWeapon =
    hud.equipped.activeSlot === 'primary' ? hud.equipped.primary : hud.equipped.secondary;
  const activeMag =
    hud.equipped.activeSlot === 'primary'
      ? hud.equipped.primaryAmmoInMag
      : hud.equipped.secondaryAmmoInMag;
  const activeReserve = activeWeapon ? hud.ammoReserves[activeWeapon.ammoType] ?? 0 : 0;

  const medicalCount = hud.inventory
    .filter((i) => i.category === 'medical')
    .reduce((acc, i) => acc + i.quantity, 0);

  const zoneSeconds = Math.ceil(hud.safeZone.timeRemaining);
  const zoneMins = Math.floor(zoneSeconds / 60);
  const zoneRem = zoneSeconds % 60;
  const zoneTimerStr = `${zoneMins}:${String(zoneRem).padStart(2, '0')}`;

  // Bearing to safe zone center
  const toZoneDeg =
    ((Math.atan2(
      hud.safeZone.targetCenterX - hud.playerX,
      -(hud.safeZone.targetCenterZ - hud.playerZ),
    ) *
      180) /
      Math.PI +
      360) %
    360;
  const zoneDiff = shortestAngleDiff(toZoneDeg, hud.playerYawDeg);

  const healthColor =
    hud.health > 55 ? 'bg-emerald-500' : hud.health > 25 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none safe-area-hud">
      {/* Damage & Outside-Zone Screen Edge Feedback */}
      {hud.damageFlashAlpha > 0.02 && (
        <div
          className="fixed inset-0 border-8 border-red-500/80"
          style={{ opacity: hud.damageFlashAlpha }}
        />
      )}
      {hud.safeZone.playerOutside && (
        <div className="fixed inset-0 border-4 border-sky-400/55" />
      )}

      {isTouchLayout ? (
        /* ================= MOBILE / TOUCH RESPONSIVE TOP BAR ================= */
        <div className="fixed top-2 inset-x-2.5 z-10 flex items-start justify-between gap-2">
          {/* Top-Left: Zone Label + Compact Minimap (keeps bottom-left free for joystick) */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="bg-[#0F1318]/88 border border-white/10 px-2 py-1 text-[11px] text-slate-200 flex items-center gap-1.5">
              <span className="font-semibold truncate max-w-[90px]">{hud.zoneName}</span>
            </div>
            <div className="bg-[#0F1318]/90 border border-white/12 p-1 self-start">
              <canvas
                ref={minimapRef}
                width={120}
                height={120}
                className="block w-16 h-16"
              />
              <div className="mt-0.5 flex items-center justify-between px-0.5 text-[9px] text-slate-400">
                <span className="font-mono-tabular text-sky-400">
                  R {Math.round(hud.safeZone.currentRadius)}m
                </span>
              </div>
            </div>
          </div>

          {/* Top-Center: Compact Compass + Latest Kill Feed */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <div className="w-full max-w-[180px] sm:max-w-[260px] bg-[#0F1318]/85 border border-white/10 px-2 py-1 overflow-hidden">
              <div className="relative h-4">
                {COMPASS_LABELS.map((item) => {
                  const diff = shortestAngleDiff(item.deg, hud.playerYawDeg);
                  if (Math.abs(diff) > 78) return null;
                  const leftPct = 50 + (diff / 78) * 48;
                  return (
                    <span
                      key={item.label}
                      style={{ left: `${leftPct}%` }}
                      className="absolute -translate-x-1/2 text-[10px] font-mono-tabular font-semibold text-slate-200"
                    >
                      {item.label}
                    </span>
                  );
                })}
                {Math.abs(zoneDiff) <= 78 && (
                  <span
                    style={{ left: `${50 + (zoneDiff / 78) * 48}%` }}
                    className="absolute bottom-0 -translate-x-1/2 text-[9px] font-bold text-sky-400"
                  >
                    ▲
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center border-t border-white/10 pt-0.5">
                <span className="font-mono-tabular text-[11px] font-semibold text-amber-400">
                  {String(Math.round(hud.playerYawDeg)).padStart(3, '0')}°
                </span>
              </div>
            </div>

            {hud.killFeed.length > 0 && (
              <div className="max-w-[190px] bg-[#0F1318]/80 border border-white/8 px-2 py-0.5 text-[10px] text-slate-200 truncate">
                <span className="text-amber-400 font-medium">{hud.killFeed[0].killer}</span>
                <span className="text-slate-400 mx-1">×</span>
                <span className="text-slate-100 font-medium">{hud.killFeed[0].victim}</span>
              </div>
            )}
          </div>

          {/* Top-Right: Compact Alive / Kills / Safe Zone */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 bg-[#0F1318]/88 border border-white/10 px-2.5 py-1">
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Alive</div>
                <div className="font-display text-sm font-bold font-mono-tabular text-slate-100 leading-tight">
                  {hud.aliveCount}
                  <span className="text-[10px] text-slate-400 font-normal">/{hud.totalCombatants}</span>
                </div>
              </div>
              <div className="h-5 w-px bg-white/12" />
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Kills</div>
                <div className="font-display text-sm font-bold font-mono-tabular text-amber-400 leading-tight">
                  {hud.kills}
                </div>
              </div>
              {showFps && !isCompactLandscape && (
                <>
                  <div className="h-5 w-px bg-white/12" />
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">FPS</div>
                    <div className="font-mono-tabular text-xs font-semibold text-emerald-400 leading-tight">
                      {hud.fps}
                    </div>
                  </div>
                </>
              )}
            </div>

            {!isCompactLandscape && (
              <div
                className={`border px-2.5 py-1 text-right text-[10px] ${
                  hud.safeZone.playerOutside
                    ? 'bg-red-950/90 border-red-500/60'
                    : 'bg-[#0F1318]/88 border-white/10'
                }`}
              >
                <span className={hud.safeZone.isShrinking ? 'text-sky-400 font-semibold' : 'text-slate-300'}>
                  P{hud.safeZone.phase} · {hud.safeZone.isShrinking ? 'Closing' : 'Next'}
                </span>
                <span className="font-mono-tabular font-bold text-slate-100 ml-1.5">
                  {zoneTimerStr}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= DESKTOP KEYBOARD & MOUSE TOP BAR ================= */
        <>
          {/* Top-Left: Kill Feed & Zone Location */}
          <div className="fixed top-4 left-4 flex flex-col gap-2 max-w-xs">
            <div className="bg-[#0F1318]/85 border border-white/10 px-3 py-1.5 text-xs text-slate-300 flex items-center gap-2">
              <span className="font-semibold text-slate-100">{hud.zoneName}</span>
              <span className="text-slate-500">·</span>
              <span className="font-mono-tabular text-slate-400">
                {Math.round(hud.playerX)}, {Math.round(hud.playerZ)}
              </span>
            </div>

            <div className="space-y-1">
              {hud.killFeed.slice(0, 3).map((entry) => (
                <div
                  key={entry.id}
                  className="bg-[#0F1318]/80 border border-white/8 px-2.5 py-1 text-xs text-slate-200 truncate"
                >
                  <span className="text-amber-400 font-medium">{entry.killer}</span>
                  <span className="text-slate-400 mx-1.5">eliminated</span>
                  <span className="text-slate-100 font-medium">{entry.victim}</span>
                  {entry.weapon && (
                    <span className="text-slate-400 ml-1.5">({entry.weapon})</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Top-Center: Tactical Compass */}
          <div className="fixed top-4 left-1/2 -translate-x-1/2 w-80 sm:w-96 bg-[#0F1318]/85 border border-white/10 px-3 py-2 overflow-hidden">
            <div className="relative h-5">
              {COMPASS_LABELS.map((item) => {
                const diff = shortestAngleDiff(item.deg, hud.playerYawDeg);
                if (Math.abs(diff) > 78) return null;
                const leftPct = 50 + (diff / 78) * 48;
                return (
                  <span
                    key={item.label}
                    style={{ left: `${leftPct}%` }}
                    className="absolute -translate-x-1/2 text-xs font-mono-tabular font-semibold text-slate-200"
                  >
                    {item.label}
                  </span>
                );
              })}
              {/* Safe Zone center direction marker */}
              {Math.abs(zoneDiff) <= 78 && (
                <span
                  style={{ left: `${50 + (zoneDiff / 78) * 48}%` }}
                  className="absolute bottom-0 -translate-x-1/2 text-[10px] font-bold text-sky-400"
                >
                  ▲
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center justify-center border-t border-white/10 pt-0.5">
              <span className="font-mono-tabular text-xs font-semibold text-amber-400">
                {String(Math.round(hud.playerYawDeg)).padStart(3, '0')}°
              </span>
            </div>
          </div>

          {/* Top-Right: Alive Count, Kills, Safe Zone Timer */}
          <div className="fixed top-4 right-4 flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 bg-[#0F1318]/88 border border-white/10 px-4 py-2">
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Alive</div>
                <div className="font-display text-xl font-bold font-mono-tabular text-slate-100 leading-tight">
                  {hud.aliveCount}
                  <span className="text-xs text-slate-400 font-normal">/{hud.totalCombatants}</span>
                </div>
              </div>

              <div className="h-7 w-px bg-white/12" />

              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Kills</div>
                <div className="font-display text-xl font-bold font-mono-tabular text-amber-400 leading-tight">
                  {hud.kills}
                </div>
              </div>

              {showFps && (
                <>
                  <div className="h-7 w-px bg-white/12" />
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">FPS</div>
                    <div className="font-mono-tabular text-sm font-semibold text-emerald-400 leading-tight">
                      {hud.fps}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Safe Zone Countdown */}
            <div
              className={`border px-3.5 py-2 text-right ${
                hud.safeZone.playerOutside
                  ? 'bg-red-950/90 border-red-500/60'
                  : 'bg-[#0F1318]/88 border-white/10'
              }`}
            >
              <div className="text-[11px] text-slate-300 flex items-center justify-end gap-2">
                <span>
                  Phase {hud.safeZone.phase}/{hud.safeZone.totalPhases}
                </span>
                <span className="text-slate-500">·</span>
                <span className={hud.safeZone.isShrinking ? 'text-sky-400 font-semibold' : 'text-slate-300'}>
                  {hud.safeZone.isShrinking ? 'Zone Closing' : 'Next Shrink'}
                </span>
              </div>
              <div className="font-mono-tabular text-base font-bold text-slate-100 mt-0.5">
                {zoneTimerStr}
              </div>
              {hud.safeZone.playerOutside && (
                <div className="text-[11px] font-semibold text-red-300 mt-0.5">
                  Outside Safe Zone — Taking {hud.safeZone.damagePerSecond} DPS
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Center Crosshair & Hit Markers */}
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="relative">
          <div
            className={`relative w-6 h-6 transition-transform duration-75 ${
              hud.isAiming ? 'scale-75' : hud.isCrouching ? 'scale-90' : 'scale-100'
            }`}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-1.5 bg-white/90" />
            <span className="absolute left-1/2 bottom-0 -translate-x-1/2 w-0.5 h-1.5 bg-white/90" />
            <span className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-1.5 bg-white/90" />
            <span className="absolute top-1/2 right-0 -translate-y-1/2 h-0.5 w-1.5 bg-white/90" />
          </div>

          {hud.hitMarkerAlpha > 0.05 && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ opacity: hud.hitMarkerAlpha }}
            >
              <span
                className={`text-lg font-bold leading-none ${
                  hud.hitMarkerKill ? 'text-red-500' : 'text-amber-400'
                }`}
              >
                ×
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Pointer Lock Prompt only in Desktop Keyboard & Mouse mode */}
      {!isTouchLayout && hud.screen === 'playing' && !hud.pointerLocked && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            onClick={onRequestLock}
            className="bg-[#0F1318]/92 border border-amber-400/60 px-5 py-2.5 text-xs font-medium text-slate-100 hover:bg-[#192028] cursor-pointer shadow-lg"
          >
            Click to Lock Mouse Aim · Tab for Inventory · Esc to Pause
          </button>
        </div>
      )}

      {/* Loot Pickup / Healing / Reloading Prompts */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 ${
          isTouchLayout
            ? isTouchLandscape
              ? 'bottom-[68px]'
              : 'bottom-[228px]'
            : 'bottom-32'
        }`}
      >
        {!isTouchLayout && hud.lootPrompt && (
          <div className="bg-[#0F1318]/92 border border-amber-400/50 px-4 py-2 text-xs text-slate-100 flex items-center gap-2">
            <span className="font-mono-tabular font-bold text-amber-400">[F]</span>
            <span>Collect {hud.lootPrompt.name}</span>
            {hud.lootPrompt.quantity > 1 && (
              <span className="font-mono-tabular text-slate-400">×{hud.lootPrompt.quantity}</span>
            )}
          </div>
        )}

        {hud.healing && (
          <div className="w-52 bg-[#0F1318]/92 border border-emerald-400/50 px-3 py-1.5 text-xs">
            <div className="flex justify-between text-emerald-300 mb-1">
              <span>Using {hud.healing.itemName}</span>
              <span className="font-mono-tabular">{hud.healing.remainingSec.toFixed(1)}s</span>
            </div>
            <div className="h-1.5 bg-white/10">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${hud.healing.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {hud.reloading && (
          <div className="w-48 bg-[#0F1318]/92 border border-amber-400/50 px-3 py-1.5 text-xs">
            <div className="flex justify-between text-amber-300 mb-1">
              <span>Reloading {hud.reloading.weaponName}</span>
              <span className="font-mono-tabular">
                {Math.round(hud.reloading.progress * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-white/10">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${hud.reloading.progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Desktop Bottom-Left Minimap */}
      {!isTouchLayout && (
        <div className="fixed bottom-4 left-4 bg-[#0F1318]/90 border border-white/12 p-1.5">
          <canvas ref={minimapRef} width={164} height={164} className="block w-40 h-40" />
          <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-400">
            <span className="truncate max-w-[105px]">{hud.mapName}</span>
            <span className="font-mono-tabular text-sky-400">
              R {Math.round(hud.safeZone.currentRadius)}m
            </span>
          </div>
        </div>
      )}

      {/* Vitals, Stamina, Armor & Weapon Bar (Edge-docked on mobile so center view stays clear) */}
      {isTouchLayout ? (
        isTouchLandscape ? (
          <div
            data-testid="mobile-vitals-bar"
            className="fixed z-10 bottom-2 left-[44%] -translate-x-1/2 w-[min(264px,34vw)] bg-[#0F1318]/85 border border-white/12 px-2.5 py-1.5"
          >
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-7 space-y-1">
                <div>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-slate-300 font-medium">
                      HP {hud.isCrouching ? '· Crouch' : ''}
                    </span>
                    <span className="font-mono-tabular font-bold text-slate-100">
                      {Math.ceil(hud.health)}/{hud.maxHealth}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10">
                    <div
                      className={`h-full transition-all duration-100 ${healthColor}`}
                      style={{ width: `${(hud.health / hud.maxHealth) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-white/10">
                    <div
                      className="h-full bg-amber-400 transition-all duration-75"
                      style={{ width: `${(hud.stamina / hud.maxStamina) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono-tabular text-[9px] text-slate-300">
                    {Math.round(hud.stamina)}%
                  </span>
                </div>
              </div>

              <div className="col-span-5 border-l border-white/10 pl-2">
                <div className="text-[9px] text-slate-400 truncate">
                  {activeWeapon ? activeWeapon.name : 'No Weapon'}
                </div>
                <div className="font-display text-base font-bold font-mono-tabular text-slate-100 leading-tight">
                  {activeMag}
                  <span className="text-[10px] text-slate-400 font-normal ml-1">/ {activeReserve}</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-slate-400">
                  <span className="inline-flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="font-mono-tabular">{Math.round(hud.equipped.vestDurability)}</span>
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5 text-sky-400" />
                    <span className="font-mono-tabular">{Math.round(hud.equipped.helmetDurability)}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            data-testid="mobile-vitals-bar"
            className="fixed z-10 top-[130px] left-2.5 w-[134px] bg-[#0F1318]/86 border border-white/12 px-2 py-1.5 space-y-1.5"
          >
            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-slate-300 font-medium">
                  HP {hud.isCrouching ? '· Crouch' : ''}
                </span>
                <span className="font-mono-tabular font-bold text-slate-100">
                  {Math.ceil(hud.health)}/{hud.maxHealth}
                </span>
              </div>
              <div className="h-1.5 bg-white/10">
                <div
                  className={`h-full transition-all duration-100 ${healthColor}`}
                  style={{ width: `${(hud.health / hud.maxHealth) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 bg-white/10">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${(hud.stamina / hud.maxStamina) * 100}%` }}
                />
              </div>
              <span className="font-mono-tabular text-[9px] text-slate-300">
                {Math.round(hud.stamina)}%
              </span>
            </div>

            <div className="border-t border-white/10 pt-1 flex items-center justify-between gap-1">
              <div className="min-w-0">
                <div className="text-[9px] text-slate-400 truncate">
                  {activeWeapon ? activeWeapon.name : 'No Weapon'}
                </div>
                <div className="font-display text-sm font-bold font-mono-tabular text-slate-100 leading-tight">
                  {activeMag}
                  <span className="text-[10px] text-slate-400 font-normal ml-0.5">/{activeReserve}</span>
                </div>
              </div>
              <div className="flex flex-col items-end text-[9px] text-slate-400 shrink-0">
                <span className="inline-flex items-center gap-0.5">
                  <Shield className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="font-mono-tabular">{Math.round(hud.equipped.vestDurability)}</span>
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Shield className="w-2.5 h-2.5 text-sky-400" />
                  <span className="font-mono-tabular">{Math.round(hud.equipped.helmetDurability)}</span>
                </span>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(540px,92vw)] bg-[#0F1318]/90 border border-white/12 p-3">
          <div className="grid grid-cols-12 gap-3 items-center">
            {/* Health & Stamina Bars */}
            <div className="col-span-6 space-y-2">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">
                    Health {hud.isCrouching ? '· Crouched' : ''}
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-100">
                    {Math.ceil(hud.health)} / {hud.maxHealth}
                  </span>
                </div>
                <div className="h-2.5 bg-white/10">
                  <div
                    className={`h-full transition-all duration-100 ${healthColor}`}
                    style={{ width: `${(hud.health / hud.maxHealth) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Stamina</span>
                  <span className="font-mono-tabular text-slate-300">
                    {Math.round(hud.stamina)}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/10">
                  <div
                    className="h-full bg-amber-400 transition-all duration-75"
                    style={{ width: `${(hud.stamina / hud.maxStamina) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Active Weapon & Ammo */}
            <div className="col-span-4 border-l border-white/10 pl-3">
              <div className="text-[11px] text-slate-400 truncate">
                {activeWeapon ? activeWeapon.name : 'No Weapon'}
              </div>
              <div className="font-display text-2xl font-bold font-mono-tabular text-slate-100 leading-tight mt-0.5">
                {activeMag}
                <span className="text-xs text-slate-400 font-normal ml-1">/ {activeReserve}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="font-mono-tabular">
                    {Math.round(hud.equipped.vestDurability)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Shield className="w-3 h-3 text-sky-400" />
                  <span className="font-mono-tabular">
                    {Math.round(hud.equipped.helmetDurability)}
                  </span>
                </span>
              </div>
            </div>

            {/* Quick Utility Indicators */}
            <div className="col-span-2 border-l border-white/10 pl-3 flex flex-col gap-1.5 text-[11px] pointer-events-auto">
              <div className="flex items-center justify-between text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <HeartPulse className="w-3 h-3 text-emerald-400" />
                  <span>[3]</span>
                </span>
                <span className="font-mono-tabular font-semibold">{medicalCount}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3 h-3 text-amber-400" />
                  <span>[V]</span>
                </span>
                <span className="font-mono-tabular">
                  {hud.cameraMode === 'first-person' ? '1P' : '3P'}
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenInventory}
                className="flex items-center justify-between text-slate-300 hover:text-amber-400 cursor-pointer"
              >
                <span className="inline-flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  <span>[Tab]</span>
                </span>
                <span>Bag</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Bottom-Right: Equipment Slot Summary */}
      {!isTouchLayout && (
        <div className="fixed bottom-4 right-4 hidden sm:flex flex-col gap-1.5 w-48">
          <div
            className={`border px-3 py-1.5 text-xs ${
              hud.equipped.activeSlot === 'primary'
                ? 'bg-[#161E28]/95 border-amber-400/70 text-slate-100'
                : 'bg-[#0F1318]/85 border-white/10 text-slate-400'
            }`}
          >
            <span className="font-mono-tabular text-amber-400 mr-1.5">[1]</span>
            {hud.equipped.primary ? hud.equipped.primary.name : 'Empty Primary'}
          </div>
          <div
            className={`border px-3 py-1.5 text-xs ${
              hud.equipped.activeSlot === 'secondary'
                ? 'bg-[#161E28]/95 border-amber-400/70 text-slate-100'
                : 'bg-[#0F1318]/85 border-white/10 text-slate-400'
            }`}
          >
            <span className="font-mono-tabular text-amber-400 mr-1.5">[2]</span>
            {hud.equipped.secondary ? hud.equipped.secondary.name : 'Empty Sidearm'}
          </div>
        </div>
      )}

      {/* Mobile Touch Controls Overlay (only in resolved Touch mode) */}
      {isTouchLayout && touchInput && (
        <TouchControlsUI
          hud={hud}
          touchInput={touchInput}
          onOpenInventory={onOpenInventory}
          onPause={onPause}
        />
      )}
    </div>
  );
};
