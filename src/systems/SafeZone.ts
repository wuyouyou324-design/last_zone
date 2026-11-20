import * as THREE from 'three';
import { SafeZoneSnapshot } from '../types/game';

interface ZonePhaseConfig {
  targetRadius: number;
  waitSeconds: number;
  shrinkSeconds: number;
  dps: number;
}

const PHASES: ZonePhaseConfig[] = [
  { targetRadius: 112, waitSeconds: 22, shrinkSeconds: 22, dps: 2 },
  { targetRadius: 72, waitSeconds: 18, shrinkSeconds: 20, dps: 4 },
  { targetRadius: 40, waitSeconds: 15, shrinkSeconds: 18, dps: 7 },
  { targetRadius: 18, waitSeconds: 12, shrinkSeconds: 15, dps: 11 },
  { targetRadius: 5, waitSeconds: 10, shrinkSeconds: 14, dps: 16 },
];

export class SafeZoneSystem {
  public readonly wallMesh: THREE.Mesh;
  private wallMaterial: THREE.ShaderMaterial;

  public phase = 1;
  public currentCenterX = 0;
  public currentCenterZ = 0;
  public currentRadius = 165;

  private startCenterX = 0;
  private startCenterZ = 0;
  private startRadius = 165;

  public targetCenterX = 0;
  public targetCenterZ = 0;
  public targetRadius = PHASES[0].targetRadius;

  public isShrinking = false;
  public timeRemaining = PHASES[0].waitSeconds;
  public damagePerSecond = PHASES[0].dps;
  private shrinkDuration = PHASES[0].shrinkSeconds;
  private elapsedInStage = 0;

  constructor() {
    const geo = new THREE.CylinderGeometry(1, 1, 95, 64, 1, true);
    this.wallMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x38bdf8) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float grid = smoothstep(0.92, 0.99, abs(sin(vUv.y * 45.0 - uTime * 1.8)));
          float verticalFade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
          float alpha = (0.14 + grid * 0.16) * verticalFade;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.wallMesh = new THREE.Mesh(geo, this.wallMaterial);
    this.wallMesh.position.y = 38;
    this.wallMesh.renderOrder = 5;
    this.reset();
  }

  public reset(): void {
    this.phase = 1;
    this.currentCenterX = 0;
    this.currentCenterZ = 0;
    this.currentRadius = 165;
    this.startCenterX = 0;
    this.startCenterZ = 0;
    this.startRadius = 165;
    this.isShrinking = false;
    this.elapsedInStage = 0;
    this.timeRemaining = PHASES[0].waitSeconds;
    this.damagePerSecond = PHASES[0].dps;
    this.pickNextTarget(0);
    this.syncWallTransform();
  }

  private pickNextTarget(phaseIdx: number): void {
    const cfg = PHASES[Math.min(phaseIdx, PHASES.length - 1)];
    this.targetRadius = cfg.targetRadius;
    this.damagePerSecond = cfg.dps;
    const maxOffset = Math.max(0, (this.currentRadius - this.targetRadius) * 0.52);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * maxOffset;
    this.targetCenterX = THREE.MathUtils.clamp(
      this.currentCenterX + Math.cos(angle) * dist,
      -95,
      95,
    );
    this.targetCenterZ = THREE.MathUtils.clamp(
      this.currentCenterZ + Math.sin(angle) * dist,
      -95,
      95,
    );
  }

  public update(dt: number, elapsedTotal: number): void {
    this.wallMaterial.uniforms.uTime.value = elapsedTotal;

    const phaseIdx = Math.min(this.phase - 1, PHASES.length - 1);
    const cfg = PHASES[phaseIdx];

    if (!this.isShrinking) {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.timeRemaining <= 0) {
        this.isShrinking = true;
        this.startCenterX = this.currentCenterX;
        this.startCenterZ = this.currentCenterZ;
        this.startRadius = this.currentRadius;
        this.shrinkDuration = cfg.shrinkSeconds;
        this.elapsedInStage = 0;
        this.timeRemaining = cfg.shrinkSeconds;
      }
    } else {
      this.elapsedInStage += dt;
      const t = Math.min(1, this.elapsedInStage / this.shrinkDuration);
      this.timeRemaining = Math.max(0, this.shrinkDuration - this.elapsedInStage);

      this.currentCenterX = THREE.MathUtils.lerp(this.startCenterX, this.targetCenterX, t);
      this.currentCenterZ = THREE.MathUtils.lerp(this.startCenterZ, this.targetCenterZ, t);
      this.currentRadius = THREE.MathUtils.lerp(this.startRadius, this.targetRadius, t);

      if (t >= 1) {
        this.isShrinking = false;
        if (this.phase < PHASES.length) {
          this.phase += 1;
          const nextCfg = PHASES[this.phase - 1];
          this.timeRemaining = nextCfg.waitSeconds;
          this.pickNextTarget(this.phase - 1);
        } else {
          this.timeRemaining = 0;
        }
      }
    }

    this.syncWallTransform();
  }

  private syncWallTransform(): void {
    this.wallMesh.position.x = this.currentCenterX;
    this.wallMesh.position.z = this.currentCenterZ;
    this.wallMesh.scale.set(this.currentRadius, 1, this.currentRadius);
  }

  public isPointOutside(x: number, z: number): boolean {
    const dx = x - this.currentCenterX;
    const dz = z - this.currentCenterZ;
    return dx * dx + dz * dz > this.currentRadius * this.currentRadius;
  }

  public getSnapshot(playerX: number, playerZ: number): SafeZoneSnapshot {
    return {
      phase: this.phase,
      totalPhases: PHASES.length,
      currentCenterX: this.currentCenterX,
      currentCenterZ: this.currentCenterZ,
      currentRadius: this.currentRadius,
      targetCenterX: this.targetCenterX,
      targetCenterZ: this.targetCenterZ,
      targetRadius: this.targetRadius,
      timeRemaining: this.timeRemaining,
      isShrinking: this.isShrinking,
      damagePerSecond: this.damagePerSecond,
      playerOutside: this.isPointOutside(playerX, playerZ),
    };
  }

  public dispose(): void {
    this.wallMesh.geometry.dispose();
    this.wallMaterial.dispose();
  }
}
