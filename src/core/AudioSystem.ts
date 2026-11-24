import { VehicleType } from '../types/game';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.65;
  private lastFootstepAt = 0;
  private lastZoneAlertAt = 0;

  // Continuous engine synthesizer nodes
  private engineOscMain: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineType: VehicleType = 'sedan';
  private engineActive = false;

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Ignore browser autoplay policy rejections until user interaction
      });
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playGunshot(weaponId: string, distanceScale = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.volume <= 0.01) return;
    if (distanceScale <= 0.03) return;

    const now = this.ctx.currentTime;
    const gainScale = Math.min(1, distanceScale);

    // Filtered noise crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq =
      weaponId === 'sg8' ? 680 : weaponId === 'mr12' ? 1150 : weaponId === 'p9' ? 1500 : 1280;
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + (weaponId === 'sg8' ? 0.24 : 0.14));
    filter.Q.value = 0.9;

    const noiseGain = this.ctx.createGain();
    const peak = (weaponId === 'sg8' ? 0.55 : weaponId === 'mr12' ? 0.48 : 0.36) * gainScale;
    const duration = weaponId === 'sg8' ? 0.26 : weaponId === 'mr12' ? 0.2 : 0.14;
    noiseGain.gain.setValueAtTime(peak, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + duration);

    // Low punch thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(weaponId === 'sg8' ? 140 : 185, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.32 * gainScale, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playHitMarker(isKill: boolean): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isKill ? 1420 : 1080, now);
    osc.frequency.exponentialRampToValueAtTime(isKill ? 1960 : 760, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playDamageTaken(): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playFootstep(sprinting: boolean, inUrban: boolean): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.volume <= 0.01) return;
    const nowMs = performance.now();
    const interval = sprinting ? 310 : 470;
    if (nowMs - this.lastFootstepAt < interval) return;
    this.lastFootstepAt = nowMs;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = inUrban ? 540 : 340;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(sprinting ? 0.1 : 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.075);
  }

  public playPickup(): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(760, now + 0.045);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playReload(): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.setValueAtTime(440, now + 0.06);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playHealComplete(): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.09);
    osc.frequency.setValueAtTime(783.99, now + 0.18);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playZoneWarning(): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const nowMs = performance.now();
    if (nowMs - this.lastZoneAlertAt < 2500) return;
    this.lastZoneAlertAt = nowMs;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(165, now + 0.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playMatchEnd(victory: boolean): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const notes = victory ? [392, 493.88, 587.33, 783.99] : [261.63, 220, 174.61];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const t = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.46);
    });
  }

  public startEngine(type: VehicleType): void {
    this.engineType = type;
    if (!this.ctx || !this.masterGain || this.engineActive) return;

    const now = this.ctx.currentTime;
    const oscMain = this.ctx.createOscillator();
    oscMain.type = type === 'truck' ? 'sawtooth' : 'sawtooth';
    const baseFreq = type === 'sedan' ? 54 : type === 'truck' ? 36 : 44;
    oscMain.frequency.setValueAtTime(baseFreq, now);

    const oscSub = this.ctx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.setValueAtTime(baseFreq * 0.5, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.18);

    oscMain.connect(filter);
    oscSub.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    oscMain.start(now);
    oscSub.start(now);

    this.engineOscMain = oscMain;
    this.engineOscSub = oscSub;
    this.engineFilter = filter;
    this.engineGain = gain;
    this.engineActive = true;
  }

  public updateEngine(speedRatio: number, throttleAbs: number): void {
    if (!this.ctx || !this.engineActive || !this.engineOscMain || !this.engineOscSub || !this.engineFilter || !this.engineGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const clampedSpeed = Math.max(0, Math.min(1, speedRatio));
    const base =
      this.engineType === 'sedan' ? 54 : this.engineType === 'truck' ? 35 : 44;
    const span =
      this.engineType === 'sedan' ? 108 : this.engineType === 'truck' ? 54 : 80;
    const revFreq = base + clampedSpeed * span + throttleAbs * 14;

    this.engineOscMain.frequency.setTargetAtTime(revFreq, now, 0.06);
    this.engineOscSub.frequency.setTargetAtTime(revFreq * 0.5, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(
      180 + clampedSpeed * 520 + throttleAbs * 140,
      now,
      0.08,
    );
    const targetVol = this.volume <= 0.01 ? 0.0001 : 0.075 + clampedSpeed * 0.065 + throttleAbs * 0.03;
    this.engineGain.gain.setTargetAtTime(targetVol, now, 0.08);
  }

  public stopEngine(): void {
    if (!this.engineActive) return;
    this.engineActive = false;
    try {
      this.engineOscMain?.stop();
      this.engineOscSub?.stop();
      this.engineOscMain?.disconnect();
      this.engineOscSub?.disconnect();
      this.engineFilter?.disconnect();
      this.engineGain?.disconnect();
    } catch {
      // Ignore already stopped oscillators
    }
    this.engineOscMain = null;
    this.engineOscSub = null;
    this.engineFilter = null;
    this.engineGain = null;
  }

  public playVehicleDoor(entering: boolean): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(entering ? 150 : 120, now);
    osc.frequency.exponentialRampToValueAtTime(entering ? 52 : 44, now + 0.11);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playDoorToggle(opening: boolean, distanceScale = 1): void {
    if (!this.ctx || !this.masterGain || this.volume <= 0.01 || distanceScale <= 0.04) return;
    const now = this.ctx.currentTime;
    const scale = Math.min(1, distanceScale);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(opening ? 240 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 130 : 72, now + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playVehicleCollision(intensity: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.volume <= 0.01) return;
    const scale = Math.max(0.15, Math.min(1.0, intensity));
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.38 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.23);

    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(92, now);
    thud.frequency.exponentialRampToValueAtTime(30, now + 0.16);
    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.35 * scale, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thud.connect(thudGain);
    thudGain.connect(this.masterGain);
    thud.start(now);
    thud.stop(now + 0.19);
  }

  public dispose(): void {
    this.stopEngine();
    if (this.ctx) {
      this.ctx.close().catch(() => {
        // Ignore close errors on already-closed AudioContext
      });
      this.ctx = null;
      this.masterGain = null;
      this.noiseBuffer = null;
    }
  }
}
