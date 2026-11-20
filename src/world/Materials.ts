import * as THREE from 'three';

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX = 1,
  repeatY = 1,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    draw(ctx, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function addNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  alpha: number,
  step = 2,
): void {
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const v = Math.floor(Math.random() * 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      ctx.fillRect(x, y, step, step);
    }
  }
}

export class MaterialLibrary {
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];

  public readonly terrain: THREE.MeshStandardMaterial;
  public readonly water: THREE.MeshStandardMaterial;
  public readonly concreteWall: THREE.MeshStandardMaterial;
  public readonly concreteDark: THREE.MeshStandardMaterial;
  public readonly brickWarm: THREE.MeshStandardMaterial;
  public readonly asphalt: THREE.MeshStandardMaterial;
  public readonly corrugatedSteel: THREE.MeshStandardMaterial;
  public readonly industrialAccent: THREE.MeshStandardMaterial;
  public readonly hazardTrim: THREE.MeshStandardMaterial;
  public readonly containerOlive: THREE.MeshStandardMaterial;
  public readonly containerRust: THREE.MeshStandardMaterial;
  public readonly containerSlate: THREE.MeshStandardMaterial;
  public readonly woodPlank: THREE.MeshStandardMaterial;
  public readonly treeBark: THREE.MeshStandardMaterial;
  public readonly treeFoliage: THREE.MeshStandardMaterial;
  public readonly rock: THREE.MeshStandardMaterial;
  public readonly gunMetal: THREE.MeshStandardMaterial;
  public readonly polymerDark: THREE.MeshStandardMaterial;
  public readonly lootCrateBody: THREE.MeshStandardMaterial;
  public readonly lootTrimAmber: THREE.MeshStandardMaterial;
  public readonly lootTrimEmerald: THREE.MeshStandardMaterial;

  constructor(maxAnisotropy: number) {
    const aniso = Math.min(4, Math.max(1, maxAnisotropy));

    const terrainTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#d8dcd5';
        ctx.fillRect(0, 0, s, s);
        addNoise(ctx, s, 0.14, 2);
      },
      48,
      48,
      aniso,
    );

    const concreteTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#9aa1a6';
        ctx.fillRect(0, 0, s, s);
        addNoise(ctx, s, 0.11, 2);
        ctx.strokeStyle = 'rgba(40,45,50,0.22)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, s - 2, s - 2);
        ctx.beginPath();
        ctx.moveTo(0, s * 0.5);
        ctx.lineTo(s, s * 0.5);
        ctx.stroke();
      },
      2,
      2,
      aniso,
    );

    const brickTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#8b685a';
        ctx.fillRect(0, 0, s, s);
        const rows = 8;
        const rowH = s / rows;
        ctx.fillStyle = 'rgba(45,35,32,0.32)';
        for (let r = 0; r < rows; r++) {
          ctx.fillRect(0, r * rowH, s, 2);
          const offset = r % 2 === 0 ? 0 : s / 8;
          for (let c = 0; c < 4; c++) {
            ctx.fillRect((c * (s / 4) + offset) % s, r * rowH, 2, rowH);
          }
        }
        addNoise(ctx, s, 0.09, 2);
      },
      2,
      2,
      aniso,
    );

    const corrugatedTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#6c7782';
        ctx.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 8) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x, 0, 3, s);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(x + 4, 0, 3, s);
        }
        addNoise(ctx, s, 0.06, 2);
      },
      3,
      2,
      aniso,
    );

    const hazardTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#d49b27';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#202428';
        for (let i = -s; i < s * 2; i += 32) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 16, 0);
          ctx.lineTo(i - 16, s);
          ctx.lineTo(i - 32, s);
          ctx.closePath();
          ctx.fill();
        }
      },
      4,
      1,
      aniso,
    );

    const woodTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#6d543e';
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 16) {
          ctx.fillStyle = 'rgba(28,18,10,0.28)';
          ctx.fillRect(0, y, s, 2);
        }
        addNoise(ctx, s, 0.08, 2);
      },
      2,
      2,
      aniso,
    );

    const asphaltTex = createCanvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#3c4146';
        ctx.fillRect(0, 0, s, s);
        addNoise(ctx, s, 0.16, 2);
      },
      8,
      8,
      aniso,
    );

    this.textures.push(
      terrainTex,
      concreteTex,
      brickTex,
      corrugatedTex,
      hazardTex,
      woodTex,
      asphaltTex,
    );

    this.terrain = this.reg(
      new THREE.MeshStandardMaterial({
        map: terrainTex,
        vertexColors: true,
        roughness: 0.94,
        metalness: 0.02,
      }),
    );

    this.water = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x3b5364,
        roughness: 0.25,
        metalness: 0.15,
        transparent: true,
        opacity: 0.88,
      }),
    );

    this.concreteWall = this.reg(
      new THREE.MeshStandardMaterial({
        map: concreteTex,
        color: 0xb6bcc1,
        roughness: 0.88,
        metalness: 0.04,
      }),
    );

    this.concreteDark = this.reg(
      new THREE.MeshStandardMaterial({
        map: concreteTex,
        color: 0x626a70,
        roughness: 0.9,
        metalness: 0.06,
      }),
    );

    this.brickWarm = this.reg(
      new THREE.MeshStandardMaterial({
        map: brickTex,
        color: 0x9c7b6e,
        roughness: 0.9,
        metalness: 0.03,
      }),
    );

    this.asphalt = this.reg(
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        color: 0x454b50,
        roughness: 0.92,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    this.corrugatedSteel = this.reg(
      new THREE.MeshStandardMaterial({
        map: corrugatedTex,
        color: 0x798694,
        roughness: 0.48,
        metalness: 0.65,
      }),
    );

    this.industrialAccent = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x3b4856,
        roughness: 0.45,
        metalness: 0.7,
      }),
    );

    this.hazardTrim = this.reg(
      new THREE.MeshStandardMaterial({
        map: hazardTex,
        roughness: 0.55,
        metalness: 0.25,
      }),
    );

    this.containerOlive = this.reg(
      new THREE.MeshStandardMaterial({
        map: corrugatedTex,
        color: 0x526149,
        roughness: 0.58,
        metalness: 0.45,
      }),
    );

    this.containerRust = this.reg(
      new THREE.MeshStandardMaterial({
        map: corrugatedTex,
        color: 0x7e4c3b,
        roughness: 0.68,
        metalness: 0.4,
      }),
    );

    this.containerSlate = this.reg(
      new THREE.MeshStandardMaterial({
        map: corrugatedTex,
        color: 0x46586b,
        roughness: 0.52,
        metalness: 0.5,
      }),
    );

    this.woodPlank = this.reg(
      new THREE.MeshStandardMaterial({
        map: woodTex,
        color: 0x80654e,
        roughness: 0.86,
        metalness: 0.02,
      }),
    );

    this.treeBark = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x4e3c2d,
        roughness: 0.94,
        metalness: 0.0,
      }),
    );

    this.treeFoliage = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.84,
        metalness: 0.02,
      }),
    );

    this.rock = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x747b80,
        roughness: 0.92,
        metalness: 0.05,
      }),
    );

    this.gunMetal = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x2b3138,
        roughness: 0.34,
        metalness: 0.82,
      }),
    );

    this.polymerDark = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x1b2026,
        roughness: 0.72,
        metalness: 0.1,
      }),
    );

    this.lootCrateBody = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x3b4438,
        roughness: 0.68,
        metalness: 0.22,
      }),
    );

    this.lootTrimAmber = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.5,
      }),
    );

    this.lootTrimEmerald = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.5,
      }),
    );
  }

  private reg<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  public dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures = [];
    this.materials = [];
  }
}
