import { useEffect, useRef, useState } from 'react';
import { Game } from './core/Game';
import { GameSettings, HudSnapshot, MatchSummary } from './types/game';
import { HUD } from './ui/HUD';
import { InventoryModal } from './ui/InventoryModal';
import { MainMenu } from './ui/MainMenu';
import { MatchResults } from './ui/MatchResults';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsModal } from './ui/SettingsModal';

const SETTINGS_STORAGE_KEY = 'lastzone_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  shadows: true,
  fov: 78,
  mouseSensitivity: 1.0,
  masterVolume: 0.65,
  showFps: true,
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      quality:
        parsed.quality === 'low' || parsed.quality === 'medium' || parsed.quality === 'high'
          ? parsed.quality
          : DEFAULT_SETTINGS.quality,
      shadows: typeof parsed.shadows === 'boolean' ? parsed.shadows : DEFAULT_SETTINGS.shadows,
      fov: typeof parsed.fov === 'number' ? parsed.fov : DEFAULT_SETTINGS.fov,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number'
          ? parsed.mouseSensitivity
          : DEFAULT_SETTINGS.mouseSensitivity,
      masterVolume:
        typeof parsed.masterVolume === 'number'
          ? parsed.masterVolume
          : DEFAULT_SETTINGS.masterVolume,
      showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : DEFAULT_SETTINGS.showFps,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const game = new Game(mount, settings, {
      onHudUpdate: (snap) => setHud(snap),
      onMatchEnd: (summary) => setMatchSummary(summary),
      onContextIssue: (lost) => setContextLost(lost),
      onReady: () => setReady(true),
    });
    gameRef.current = game;

    return () => {
      game.dispose();
      gameRef.current = null;
    };
    // Mount WebGL scene once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSettingsChange = (next: GameSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota issues
    }
    gameRef.current?.applySettings(next);
  };

  const handleStartMatch = () => {
    setMatchSummary(null);
    setSettingsOpen(false);
    gameRef.current?.startNewMatch();
  };

  const currentScreen = hud?.screen ?? 'menu';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0F1318]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1318]/95 p-6">
          <div className="max-w-md border border-white/12 bg-[#141A22] p-6 text-center">
            <h2 className="font-display text-xl font-bold text-slate-100">
              Graphics Context Interrupted
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              WebGL rendering was temporarily suspended by the browser. Reload the page if it does not resume automatically.
            </p>
          </div>
        </div>
      )}

      {currentScreen === 'menu' && (
        <MainMenu
          ready={ready}
          onStartMatch={handleStartMatch}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {hud && (currentScreen === 'playing' || currentScreen === 'inventory' || currentScreen === 'paused') && (
        <HUD
          hud={hud}
          minimapSource={gameRef.current?.getMinimapCanvas() ?? null}
          showFps={settings.showFps}
          onRequestLock={() => gameRef.current?.requestPointerLock()}
          onOpenInventory={() => gameRef.current?.setScreen('inventory')}
        />
      )}

      {hud && currentScreen === 'inventory' && (
        <InventoryModal
          hud={hud}
          onEquip={(uid) => gameRef.current?.equipInventoryItem(uid)}
          onUseMedical={(uid) => gameRef.current?.useMedicalItem(uid)}
          onDrop={(uid) => gameRef.current?.dropInventoryItem(uid)}
          onSwitchSlot={(slot) => gameRef.current?.switchWeaponSlot(slot)}
          onClose={() => gameRef.current?.resumePlaying()}
        />
      )}

      {currentScreen === 'paused' && !settingsOpen && (
        <PauseMenu
          onResume={() => gameRef.current?.resumePlaying()}
          onOpenSettings={() => setSettingsOpen(true)}
          onRestart={handleStartMatch}
          onExitToMenu={() => gameRef.current?.setScreen('menu')}
        />
      )}

      {currentScreen === 'results' && matchSummary && (
        <MatchResults
          summary={matchSummary}
          onPlayAgain={handleStartMatch}
          onMainMenu={() => {
            setMatchSummary(null);
            gameRef.current?.setScreen('menu');
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
