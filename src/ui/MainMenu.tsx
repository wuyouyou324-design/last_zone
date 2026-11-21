import React from 'react';
import { Settings, Play, Crosshair, Shield, Compass, MapPin } from 'lucide-react';
import { GameDifficulty, MapId, ResolvedInputMode } from '../types/game';
import { MAP_CATALOG, MAP_LIST } from '../world/MapCatalog';

interface MainMenuProps {
  ready: boolean;
  selectedMapId: MapId;
  difficulty: GameDifficulty;
  inputMode?: ResolvedInputMode;
  onSelectMap: (mapId: MapId) => void;
  onSelectDifficulty: (difficulty: GameDifficulty) => void;
  onStartMatch: () => void;
  onOpenSettings: () => void;
}

const DIFFICULTIES: Array<{ id: GameDifficulty; label: string; note: string }> = [
  { id: 'easy', label: 'Easy', note: 'Relaxed reactions & lower pressure' },
  { id: 'normal', label: 'Normal', note: 'Balanced Battle Royale combat' },
  { id: 'hard', label: 'Hard', note: 'Faster bots & sharper pressure' },
];

export const MainMenu: React.FC<MainMenuProps> = ({
  ready,
  selectedMapId,
  difficulty,
  inputMode = 'keyboard-mouse',
  onSelectMap,
  onSelectDifficulty,
  onStartMatch,
  onOpenSettings,
}) => {
  const activeMap = MAP_CATALOG[selectedMapId];
  const activeDiff = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1];
  const isTouch = inputMode === 'touch';

  return (
    <div className="fixed inset-0 z-20 flex items-start sm:items-center justify-center bg-[#0F1318]/72 py-4 px-3 sm:p-6 overflow-y-auto touch-pan-y safe-area-hud">
      <div className="my-auto w-full max-w-5xl border border-white/12 bg-[#131920]/95 p-5 sm:p-7 md:p-9 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-stretch">
          {/* Primary Title, Map Selector & Action Column */}
          <div className="md:col-span-7 flex flex-col justify-between gap-5 sm:gap-6">
            <div>
              <p className="text-xs tracking-wider uppercase text-amber-400 font-semibold mb-1.5 sm:mb-2">
                Single-Player Tactical Survival
              </p>
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-100 leading-none">
                LAST ZONE
              </h1>
              <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed max-w-lg">
                Drop into one of three distinct four-zone arenas against 11 autonomous AI combatants.
                Scavenge tactical weapons, manage armor and medical supplies, and outlast the enclosing storm.
              </p>
            </div>

            {/* Arena / Map Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-200">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>Select Arena</span>
                </span>
                <span className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-none">
                  {activeMap.name} · {activeMap.climateLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MAP_LIST.map((map) => {
                  const selected = map.id === selectedMapId;
                  return (
                    <button
                      key={map.id}
                      type="button"
                      disabled={!ready}
                      onClick={() => onSelectMap(map.id)}
                      className={`text-left p-2.5 sm:p-3 border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300 ${
                        selected
                          ? 'border-amber-400 bg-[#1B232E] text-slate-100'
                          : 'border-white/12 bg-[#161D26] hover:bg-[#1A222D] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold truncate">
                          {map.name}
                        </span>
                        <span
                          className="w-3 h-3 shrink-0 border border-white/25"
                          style={{ backgroundColor: map.swatchHex }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                        {map.climateLabel}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-300/90 leading-snug">
                        {map.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI Difficulty Selector */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-xs font-semibold tracking-wide text-slate-200">
                  Combat Difficulty
                </span>
                <span className="text-xs text-slate-400 truncate">{activeDiff.note}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 bg-[#0F1318] p-1 border border-white/10">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    data-testid={`menu-difficulty-${d.id}`}
                    onClick={() => onSelectDifficulty(d.id)}
                    className={`py-2 px-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      difficulty === d.id
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1">
              <button
                type="button"
                disabled={!ready}
                onClick={onStartMatch}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-display font-bold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                <Play className="w-4 h-4" />
                {ready ? `Deploy to ${activeMap.name}` : 'Initializing Physics...'}
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-3 border border-white/15 bg-[#1B222C] hover:bg-[#232C38] text-slate-200 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                <Settings className="w-4 h-4" />
                Game Settings
              </button>
            </div>
          </div>

          {/* Field Controls & Tactical Brief Column */}
          <div className="md:col-span-5 border-t md:border-t-0 md:border-l border-white/10 pt-5 md:pt-0 md:pl-8 flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="font-display text-sm font-semibold tracking-wide text-slate-200">
                  Field Controls
                </h2>
                <span className="text-[11px] font-mono-tabular text-amber-400">
                  {isTouch ? 'Touch Layout' : 'Keyboard & Mouse'}
                </span>
              </div>

              {isTouch ? (
                <dl className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Move / Sprint</dt>
                    <dd className="font-mono-tabular text-slate-100">Left Stick / Sprint</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Look / Aim Camera</dt>
                    <dd className="font-mono-tabular text-slate-100">Right Screen Drag</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Fire / ADS Sight</dt>
                    <dd className="font-mono-tabular text-slate-100">FIRE / AIM Buttons</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Jump / Crouch</dt>
                    <dd className="font-mono-tabular text-slate-100">JUMP / CROUCH</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Reload / Switch Gun</dt>
                    <dd className="font-mono-tabular text-slate-100">Reload / [1/2] Button</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-400">1P-3P / Heal / Bag</dt>
                    <dd className="font-mono-tabular text-slate-100">Top-Right Bar</dd>
                  </div>
                </dl>
              ) : (
                <dl className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Move / Sprint</dt>
                    <dd className="font-mono-tabular text-slate-100">WASD / Shift</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Jump / Crouch</dt>
                    <dd className="font-mono-tabular text-slate-100">Space / Ctrl, C</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Fire / Aim Sight</dt>
                    <dd className="font-mono-tabular text-slate-100">LMB / RMB</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Reload / Collect Loot</dt>
                    <dd className="font-mono-tabular text-slate-100">R / F</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Switch 1P / 3P Camera</dt>
                    <dd className="font-mono-tabular text-slate-100">V</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/6 pb-1.5">
                    <dt className="text-slate-400">Weapons / Quick Heal</dt>
                    <dd className="font-mono-tabular text-slate-100">1, 2 / 3</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-400">Inventory / Pause</dt>
                    <dd className="font-mono-tabular text-slate-100">Tab / Esc</dd>
                  </div>
                </dl>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10 text-xs text-slate-400">
              <div className="flex flex-col gap-1">
                <Compass className="w-4 h-4 text-amber-400" />
                <span className="text-slate-200 font-medium">3 Arenas</span>
                <span>4 Zones Each</span>
              </div>
              <div className="flex flex-col gap-1">
                <Crosshair className="w-4 h-4 text-amber-400" />
                <span className="text-slate-200 font-medium">1P / 3P</span>
                <span>Live Switch</span>
              </div>
              <div className="flex flex-col gap-1">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-200 font-medium">11 AI Bots</span>
                <span>FSM Combat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
