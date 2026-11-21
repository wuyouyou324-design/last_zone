import React from 'react';
import { X, Shield, HeartPulse, Crosshair, Trash2 } from 'lucide-react';
import { HudSnapshot } from '../types/game';

interface InventoryModalProps {
  hud: HudSnapshot;
  onEquip: (uid: string) => void;
  onUseMedical: (uid: string) => void;
  onDrop: (uid: string) => void;
  onSwitchSlot: (slot: 'primary' | 'secondary') => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  onEquip,
  onUseMedical,
  onDrop,
  onSwitchSlot,
  onClose,
}) => {
  const { equipped, inventory, ammoReserves } = hud;

  return (
    <div className="fixed inset-0 z-30 flex items-start sm:items-center justify-center bg-[#0A0D11]/82 py-4 px-3 sm:p-6 overflow-y-auto touch-pan-y">
      <div className="my-auto w-full max-w-4xl border border-white/12 bg-[#141A22] p-5 sm:p-6 md:p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-100">
              Inventory & Loadout
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Backpack {inventory.length} / 12 slots · Press Tab or Esc to close
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Equipped Gear & Protection */}
          <div className="md:col-span-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Equipment
            </h3>

            {/* Primary Weapon */}
            <button
              type="button"
              onClick={() => equipped.primary && onSwitchSlot('primary')}
              className={`w-full text-left p-3.5 border transition-colors cursor-pointer ${
                equipped.activeSlot === 'primary'
                  ? 'border-amber-400/70 bg-[#1B232D]'
                  : 'border-white/10 bg-[#0F1318] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Slot 1 · Primary Weapon</span>
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
              </div>
              {equipped.primary ? (
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-slate-100">
                    {equipped.primary.name}
                  </span>
                  <span className="font-mono-tabular text-xs text-amber-400">
                    {equipped.primaryAmmoInMag} / {ammoReserves[equipped.primary.ammoType] ?? 0} {equipped.primary.ammoType}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">Empty — Scavenge loot crates</span>
              )}
            </button>

            {/* Secondary Weapon */}
            <button
              type="button"
              onClick={() => onSwitchSlot('secondary')}
              className={`w-full text-left p-3.5 border transition-colors cursor-pointer ${
                equipped.activeSlot === 'secondary'
                  ? 'border-amber-400/70 bg-[#1B232D]'
                  : 'border-white/10 bg-[#0F1318] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Slot 2 · Secondary Sidearm</span>
                <Crosshair className="w-3.5 h-3.5 text-slate-300" />
              </div>
              {equipped.secondary ? (
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-slate-100">
                    {equipped.secondary.name}
                  </span>
                  <span className="font-mono-tabular text-xs text-slate-300">
                    {equipped.secondaryAmmoInMag} / {ammoReserves[equipped.secondary.ammoType] ?? 0} {equipped.secondary.ammoType}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">None</span>
              )}
            </button>

            {/* Protection Equipment */}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-2">
              Protection Gear
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-white/10 bg-[#0F1318] p-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Ballistic Vest</span>
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                  {Math.round(equipped.vestDurability)} / {equipped.vestMax}
                </div>
                <div className="mt-2 h-1.5 bg-white/10">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${(equipped.vestDurability / equipped.vestMax) * 100}%` }}
                  />
                </div>
              </div>

              <div className="border border-white/10 bg-[#0F1318] p-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Helmet</span>
                  <Shield className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                  {Math.round(equipped.helmetDurability)} / {equipped.helmetMax}
                </div>
                <div className="mt-2 h-1.5 bg-white/10">
                  <div
                    className="h-full bg-sky-400"
                    style={{ width: `${(equipped.helmetDurability / equipped.helmetMax) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Ammo Reserves */}
            <div className="border border-white/10 bg-[#0F1318] p-3">
              <div className="text-xs text-slate-400 mb-2">Ammunition Reserves</div>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono-tabular">
                {Object.entries(ammoReserves).map(([caliber, qty]) => (
                  <div key={caliber} className="bg-[#161C24] px-2 py-1.5 text-center">
                    <div className="text-slate-400">{caliber}</div>
                    <div className="text-slate-100 font-semibold">{qty}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Backpack Items */}
          <div className="md:col-span-7 flex flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Backpack Storage
            </h3>

            {inventory.length === 0 ? (
              <div className="flex-1 flex items-center justify-center border border-white/10 bg-[#0F1318] p-8 text-sm text-slate-400">
                Backpack is empty. Approach supply crates and press F to collect gear.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {inventory.map((item) => (
                  <div
                    key={item.uid}
                    className="flex items-center justify-between gap-4 border border-white/10 bg-[#0F1318] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-100 truncate">
                          {item.name}
                        </span>
                        <span className="font-mono-tabular text-xs text-amber-400">
                          ×{item.quantity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {item.category} · {item.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.category === 'medical' && (
                        <button
                          type="button"
                          onClick={() => onUseMedical(item.uid)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
                        >
                          <HeartPulse className="w-3.5 h-3.5" />
                          Use
                        </button>
                      )}
                      {(item.category === 'primary' || item.category === 'armor') && (
                        <button
                          type="button"
                          onClick={() => onEquip(item.uid)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
                        >
                          Equip
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDrop(item.uid)}
                        aria-label={`Drop ${item.name}`}
                        className="p-1.5 border border-white/12 hover:bg-white/10 text-slate-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
