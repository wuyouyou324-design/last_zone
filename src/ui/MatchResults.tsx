import React from 'react';
import { Trophy, Skull, RotateCcw, Home } from 'lucide-react';
import { MatchSummary } from '../types/game';

interface MatchResultsProps {
  summary: MatchSummary;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const MatchResults: React.FC<MatchResultsProps> = ({
  summary,
  onPlayAgain,
  onMainMenu,
}) => {
  const mins = Math.floor(summary.survivalTimeSec / 60);
  const secs = summary.survivalTimeSec % 60;
  const formattedTime = `${mins}m ${String(secs).padStart(2, '0')}s`;

  return (
    <div className="fixed inset-0 z-30 flex items-start sm:items-center justify-center bg-[#0A0D11]/88 py-4 px-3 sm:p-6 overflow-y-auto touch-pan-y">
      <div className="my-auto w-full max-w-xl border border-white/12 bg-[#141A22] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          {summary.victory ? (
            <Trophy className="w-6 h-6 text-amber-400" />
          ) : (
            <Skull className="w-6 h-6 text-red-400" />
          )}
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              summary.victory ? 'text-amber-400' : 'text-red-400'
            }`}
          >
            {summary.victory ? 'Victory' : 'Eliminated'}
          </span>
        </div>

        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-100">
          {summary.victory ? 'LAST ONE STANDING' : 'MATCH CONCLUDED'}
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          {summary.victory
            ? 'You outlasted all opponents in the arena.'
            : `Eliminated by ${summary.eliminatedBy ?? 'hostile fire'}.`}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-7 border-y border-white/10 py-6">
          <div>
            <div className="text-xs text-slate-400">Placement</div>
            <div className="font-display text-2xl font-bold font-mono-tabular text-amber-400 mt-1">
              #{summary.placement}
              <span className="text-sm text-slate-400 font-normal">/{summary.totalCombatants}</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Eliminations</div>
            <div className="font-display text-2xl font-bold font-mono-tabular text-slate-100 mt-1">
              {summary.kills}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Damage Dealt</div>
            <div className="font-display text-2xl font-bold font-mono-tabular text-slate-100 mt-1">
              {summary.damageDealt}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Survival Time</div>
            <div className="font-display text-2xl font-bold font-mono-tabular text-slate-100 mt-1">
              {formattedTime}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onMainMenu}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/15 bg-[#1B222C] hover:bg-[#232C38] text-slate-200 text-sm font-medium transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Main Menu
          </button>

          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
};
