import type * as THREE from 'three';

export function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class GameLoop {
  private startTimeMs = 0;
  private lastTickMs = 0;
  private frameId = 0;
  private running = false;
  private fpsAccum = 0;
  private fpsFrames = 0;
  public currentFps = 60;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private isSoftwareGl: boolean,
    private onTick: (dt: number, elapsed: number) => void,
  ) {}

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.startTimeMs = performance.now();
    this.lastTickMs = this.startTimeMs;
    this.scheduleNext();
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private tick(): void {
    if (!this.running) return;
    const nowMs = performance.now();
    const rawDelta = (nowMs - this.lastTickMs) / 1000;
    this.lastTickMs = nowMs;
    const dt = Math.min(0.05, Math.max(0.001, rawDelta));
    const elapsed = (nowMs - this.startTimeMs) / 1000;

    this.fpsAccum += rawDelta;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.onTick(dt, elapsed);
    this.scheduleNext();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!this.running) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }
}
