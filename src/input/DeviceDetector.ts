import { DeviceCapabilities, InputModeSetting, ResolvedInputMode } from '../types/game';

type LiveActivity = 'touch' | 'keyboard-mouse';

function queryMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

export class DeviceDetector {
  private capabilities: DeviceCapabilities;
  private lastActivity: LiveActivity | null = null;
  private observedPhysicalKeyboard = false;
  private listeners = new Set<() => void>();
  private mediaQueries: MediaQueryList[] = [];
  private disposed = false;

  constructor() {
    this.capabilities = this.probeCapabilities();
    this.bindCapabilityWatchers();
  }

  public getCapabilities(): DeviceCapabilities {
    return { ...this.capabilities };
  }

  public reportLiveActivity(kind: LiveActivity, viaKeyboard = false): boolean {
    let changed = false;
    if (viaKeyboard && !this.observedPhysicalKeyboard) {
      this.observedPhysicalKeyboard = true;
      this.capabilities = this.probeCapabilities();
      changed = true;
    }
    if (this.lastActivity !== kind) {
      this.lastActivity = kind;
      changed = true;
    }
    if (changed) {
      this.notify();
    }
    return changed;
  }

  public resolveMode(setting: InputModeSetting): ResolvedInputMode {
    if (setting === 'touch') return 'touch';
    if (setting === 'keyboard-mouse') return 'keyboard-mouse';

    // Automatic adaptive detection using hardware capabilities & hybrid live activity
    const caps = this.capabilities;

    if (caps.isHybrid && this.lastActivity) {
      return this.lastActivity;
    }

    // Touch-first devices (phones & standalone tablets without mouse/trackpad primary pointer)
    const primaryCoarse = queryMatches('(pointer: coarse)');
    const primaryFine = queryMatches('(pointer: fine)');

    if (primaryCoarse && !primaryFine) {
      if (this.lastActivity === 'keyboard-mouse' && caps.likelyKeyboard) {
        return 'keyboard-mouse';
      }
      return 'touch';
    }

    if (caps.hasTouch && !caps.hasFinePointer && !caps.hasHover) {
      return 'touch';
    }

    // Hybrid laptop with touchscreen where primary pointer is mouse/trackpad
    if (caps.isHybrid && primaryFine) {
      return this.lastActivity === 'touch' ? 'touch' : 'keyboard-mouse';
    }

    if (caps.hasTouch && !caps.likelyMouse) {
      return 'touch';
    }

    return 'keyboard-mouse';
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private probeCapabilities(): DeviceCapabilities {
    const hasTouch =
      typeof window !== 'undefined' &&
      ((typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0) ||
        'ontouchstart' in window);

    const hasCoarsePointer =
      queryMatches('(pointer: coarse)') || queryMatches('(any-pointer: coarse)');
    const hasFinePointer =
      queryMatches('(pointer: fine)') || queryMatches('(any-pointer: fine)');
    const hasHover = queryMatches('(hover: hover)') || queryMatches('(any-hover: hover)');

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const orientation: 'portrait' | 'landscape' =
      viewportWidth >= viewportHeight ? 'landscape' : 'portrait';

    const likelyMouse = hasFinePointer && hasHover;
    const likelyKeyboard =
      this.observedPhysicalKeyboard || hasFinePointer || (!hasCoarsePointer && !hasTouch);
    const isHybrid = hasTouch && (hasFinePointer || hasHover || this.observedPhysicalKeyboard);

    return {
      hasTouch,
      hasCoarsePointer,
      hasFinePointer,
      hasHover,
      likelyKeyboard,
      likelyMouse,
      isHybrid,
      orientation,
      viewportWidth,
      viewportHeight,
    };
  }

  private handleEnvironmentChange = (): void => {
    if (this.disposed) return;
    const next = this.probeCapabilities();
    const prev = this.capabilities;
    const changed =
      prev.hasTouch !== next.hasTouch ||
      prev.hasCoarsePointer !== next.hasCoarsePointer ||
      prev.hasFinePointer !== next.hasFinePointer ||
      prev.hasHover !== next.hasHover ||
      prev.isHybrid !== next.isHybrid ||
      prev.orientation !== next.orientation ||
      prev.viewportWidth !== next.viewportWidth ||
      prev.viewportHeight !== next.viewportHeight;

    this.capabilities = next;
    if (changed) {
      this.notify();
    }
  };

  private bindCapabilityWatchers(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', this.handleEnvironmentChange);
    window.addEventListener('orientationchange', this.handleEnvironmentChange);

    if (typeof window.matchMedia === 'function') {
      const queries = [
        '(pointer: coarse)',
        '(any-pointer: coarse)',
        '(pointer: fine)',
        '(any-pointer: fine)',
        '(hover: hover)',
        '(any-hover: hover)',
      ];
      for (const q of queries) {
        const mql = window.matchMedia(q);
        mql.addEventListener('change', this.handleEnvironmentChange);
        this.mediaQueries.push(mql);
      }
    }
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  public dispose(): void {
    this.disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleEnvironmentChange);
      window.removeEventListener('orientationchange', this.handleEnvironmentChange);
    }
    for (const mql of this.mediaQueries) {
      mql.removeEventListener('change', this.handleEnvironmentChange);
    }
    this.mediaQueries = [];
    this.listeners.clear();
  }
}
