import React from 'react';
import { X } from 'lucide-react';
import { GameSettings, GraphicsQuality } from '../types/game';

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onChange,
  onClose,
}) => {
  const qualities: GraphicsQuality[] = ['low', 'medium', 'high'];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0A0D11]/85 p-6">
      <div className="w-full max-w-lg border border-white/12 bg-[#141A22] p-6 md:p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <h2 className="font-display text-xl font-bold text-slate-100">Game Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 text-sm">
          {/* Graphics Preset */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-200 font-medium">Graphics Quality</span>
              <span className="text-xs text-slate-400">
                {settings.quality === 'low'
                  ? 'Optimized for integrated GPUs'
                  : settings.quality === 'medium'
                    ? 'Balanced 720p+ performance'
                    : 'Full resolution & foliage'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 bg-[#0F1318] p-1 border border-white/10">
              {qualities.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onChange({ ...settings, quality: q })}
                  className={`py-2 text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                    settings.quality === q
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Shadows & FPS Display */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center justify-between border border-white/10 bg-[#0F1318] px-3.5 py-2.5 cursor-pointer">
              <span className="text-slate-200 text-xs font-medium">Dynamic Shadows</span>
              <input
                type="checkbox"
                checked={settings.shadows}
                onChange={(e) => onChange({ ...settings, shadows: e.target.checked })}
                className="accent-amber-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between border border-white/10 bg-[#0F1318] px-3.5 py-2.5 cursor-pointer">
              <span className="text-slate-200 text-xs font-medium">Show FPS</span>
              <input
                type="checkbox"
                checked={settings.showFps}
                onChange={(e) => onChange({ ...settings, showFps: e.target.checked })}
                className="accent-amber-500 w-4 h-4 cursor-pointer"
              />
            </label>
          </div>

          {/* Field of View */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-200 font-medium">Field of View</span>
              <span className="font-mono-tabular text-xs text-amber-400">{settings.fov}°</span>
            </div>
            <input
              type="range"
              min={65}
              max={100}
              step={1}
              value={settings.fov}
              onChange={(e) => onChange({ ...settings, fov: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Mouse Sensitivity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-200 font-medium">Mouse Sensitivity</span>
              <span className="font-mono-tabular text-xs text-amber-400">
                {settings.mouseSensitivity.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={2.2}
              step={0.05}
              value={settings.mouseSensitivity}
              onChange={(e) =>
                onChange({ ...settings, mouseSensitivity: Number(e.target.value) })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Master Volume */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-200 font-medium">Master Audio Volume</span>
              <span className="font-mono-tabular text-xs text-amber-400">
                {Math.round(settings.masterVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.masterVolume}
              onChange={(e) =>
                onChange({ ...settings, masterVolume: Number(e.target.value) })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="mt-7 flex justify-end border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            Save and Close
          </button>
        </div>
      </div>
    </div>
  );
};
