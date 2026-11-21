import React from 'react';
import { X } from 'lucide-react';
import {
  DeviceCapabilities,
  GameDifficulty,
  GameSettings,
  GraphicsQuality,
  InputModeSetting,
  ResolvedInputMode,
} from '../types/game';

interface SettingsModalProps {
  settings: GameSettings;
  resolvedInputMode?: ResolvedInputMode;
  deviceCapabilities?: DeviceCapabilities;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

const INPUT_MODES: Array<{ value: InputModeSetting; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'touch', label: 'Mobile Touch' },
  { value: 'keyboard-mouse', label: 'Keyboard & Mouse' },
];

const DIFFICULTIES: Array<{ value: GameDifficulty; label: string; desc: string }> = [
  { value: 'easy', label: 'Easy', desc: 'Slower AI reactions, lower pressure' },
  { value: 'normal', label: 'Normal', desc: 'Balanced tactical AI (Default)' },
  { value: 'hard', label: 'Hard', desc: 'Sharper aim & persistent pressure' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  resolvedInputMode,
  deviceCapabilities,
  onChange,
  onClose,
}) => {
  const qualities: GraphicsQuality[] = ['low', 'medium', 'high'];

  const capTags: string[] = [];
  if (deviceCapabilities) {
    if (deviceCapabilities.hasTouch) capTags.push('Touchscreen');
    if (deviceCapabilities.likelyMouse) capTags.push('Mouse');
    if (deviceCapabilities.likelyKeyboard) capTags.push('Keyboard');
    if (deviceCapabilities.isHybrid) capTags.push('Hybrid Device');
    capTags.push(deviceCapabilities.orientation === 'landscape' ? 'Landscape' : 'Portrait');
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start sm:items-center justify-center bg-[#0A0D11]/85 py-4 px-3 sm:p-6 overflow-y-auto touch-pan-y">
      <div className="my-auto w-full max-w-lg border border-white/12 bg-[#141A22] p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-5">
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

        <div className="space-y-4 sm:space-y-5 text-sm">
          {/* AI Combat Difficulty */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-slate-200 font-medium">AI Difficulty</span>
              <span className="text-xs text-slate-400">
                {(DIFFICULTIES.find((d) => d.value === settings.difficulty) ?? DIFFICULTIES[1]).desc}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-[#0F1318] p-1 border border-white/10">
              {DIFFICULTIES.map((diff) => (
                <button
                  key={diff.value}
                  type="button"
                  data-testid={`settings-difficulty-${diff.value}`}
                  onClick={() => onChange({ ...settings, difficulty: diff.value })}
                  className={`py-2 px-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    settings.difficulty === diff.value
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {diff.label}
                </button>
              ))}
            </div>
          </div>

          {/* Adaptive Control Mode */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-slate-200 font-medium">Control Mode</span>
              <span className="text-xs text-amber-400 font-mono-tabular">
                Active:{' '}
                {resolvedInputMode === 'touch'
                  ? 'Touch Controls'
                  : resolvedInputMode === 'keyboard-mouse'
                    ? 'Keyboard & Mouse'
                    : 'Auto'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-[#0F1318] p-1 border border-white/10">
              {INPUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  data-testid={`settings-input-mode-${mode.value}`}
                  onClick={() => onChange({ ...settings, inputMode: mode.value })}
                  className={`py-2 px-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    settings.inputMode === mode.value
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {capTags.length > 0 && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Detected: {capTags.join(' · ')}
              </p>
            )}
          </div>

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
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
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

          {/* Touch Camera Sensitivity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-200 font-medium">Touch Look Sensitivity</span>
              <span className="font-mono-tabular text-xs text-amber-400">
                {settings.touchSensitivity.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={2.2}
              step={0.05}
              value={settings.touchSensitivity}
              onChange={(e) =>
                onChange({ ...settings, touchSensitivity: Number(e.target.value) })
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

        <div className="mt-6 flex justify-end border-t border-white/10 pt-4">
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
