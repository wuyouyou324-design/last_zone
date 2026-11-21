import React from 'react';
import { Play, RotateCcw, Settings, LogOut } from 'lucide-react';

interface PauseMenuProps {
  onResume: () => void;
  onOpenSettings: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  onResume,
  onOpenSettings,
  onRestart,
  onExitToMenu,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-start sm:items-center justify-center bg-[#0A0D11]/80 py-4 px-3 sm:p-6 overflow-y-auto touch-pan-y">
      <div className="my-auto w-full max-w-sm border border-white/12 bg-[#141A22] p-6 sm:p-7 shadow-2xl">
        <p className="text-xs text-amber-400 font-semibold tracking-wider uppercase mb-1">
          Match Paused
        </p>
        <h2 className="font-display text-2xl font-bold text-slate-100 mb-6">LAST ZONE</h2>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Resume Match
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-white/12 bg-[#1B222C] hover:bg-[#232C38] text-slate-200 text-sm font-medium transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Game Settings
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-white/12 bg-[#1B222C] hover:bg-[#232C38] text-slate-200 text-sm font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Restart Match
          </button>

          <button
            type="button"
            onClick={onExitToMenu}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-red-500/30 bg-red-950/30 hover:bg-red-900/40 text-red-200 text-sm font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Exit to Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
