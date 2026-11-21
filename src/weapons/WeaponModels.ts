import * as THREE from 'three';

export type WeaponModelId = 'vx47' | 'mr12' | 'sg8' | 'p9';

function createMicroNoiseNormalTexture(
  size: number,
  mode: 'stipple' | 'brushed' | 'checkered',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Neutral tangent-space normal RGB(128, 128, 255)
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, size, size);

    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        let nx = 0;
        let ny = 0;

        if (mode === 'stipple') {
          const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const v = h - Math.floor(h);
          nx = (v - 0.5) * 48;
          ny = (Math.cos(x * 3.1 + y * 5.7) * 0.5) * 32;
        } else if (mode === 'brushed') {
          const streak = Math.sin(y * 1.9) * 18 + (Math.sin(x * 0.35 + y * 4.2) * 10);
          nx = streak * 0.35;
          ny = streak;
        } else {
          const diagA = ((x + y) % 8) < 4 ? 1 : -1;
          const diagB = ((x - y + size) % 8) < 4 ? 1 : -1;
          nx = diagA * 22;
          ny = diagB * 22;
        }

        d[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
        d[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
        d[idx + 2] = 246;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

export class WeaponMaterialLibrary {
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];

  public readonly polymerMatte: THREE.MeshStandardMaterial;
  public readonly rubberGrip: THREE.MeshStandardMaterial;
  public readonly brushedMetal: THREE.MeshPhysicalMaterial;
  public readonly anodizedDark: THREE.MeshStandardMaterial;
  public readonly paintedTan: THREE.MeshStandardMaterial;
  public readonly paintedOlive: THREE.MeshStandardMaterial;
  public readonly paintedSlate: THREE.MeshStandardMaterial;
  public readonly opticGlass: THREE.MeshPhysicalMaterial;
  public readonly reticleGreen: THREE.MeshStandardMaterial;
  public readonly reticleAmber: THREE.MeshStandardMaterial;
  public readonly shellRed: THREE.MeshStandardMaterial;
  public readonly brassDetail: THREE.MeshStandardMaterial;

  constructor(maxAnisotropy: number) {
    const stippleNormal = createMicroNoiseNormalTexture(64, 'stipple');
    const brushedNormal = createMicroNoiseNormalTexture(64, 'brushed');
    const rubberNormal = createMicroNoiseNormalTexture(64, 'checkered');

    const aniso = Math.min(4, Math.max(1, maxAnisotropy));
    stippleNormal.anisotropy = aniso;
    brushedNormal.anisotropy = aniso;
    rubberNormal.anisotropy = aniso;

    this.textures.push(stippleNormal, brushedNormal, rubberNormal);

    this.polymerMatte = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x20252c,
        roughness: 0.78,
        metalness: 0.08,
        normalMap: stippleNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
    );

    this.rubberGrip = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x15181d,
        roughness: 0.92,
        metalness: 0.02,
        normalMap: rubberNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
      }),
    );

    this.brushedMetal = this.reg(
      new THREE.MeshPhysicalMaterial({
        color: 0x3b424c,
        roughness: 0.3,
        metalness: 0.88,
        anisotropy: 0.72,
        anisotropyRotation: Math.PI * 0.5,
        normalMap: brushedNormal,
        normalScale: new THREE.Vector2(0.22, 0.22),
      }),
    );

    this.anodizedDark = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x2a3038,
        roughness: 0.44,
        metalness: 0.68,
        normalMap: stippleNormal,
        normalScale: new THREE.Vector2(0.14, 0.14),
      }),
    );

    this.paintedTan = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x575245,
        roughness: 0.52,
        metalness: 0.38,
        normalMap: stippleNormal,
        normalScale: new THREE.Vector2(0.18, 0.18),
      }),
    );

    this.paintedOlive = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x455040,
        roughness: 0.5,
        metalness: 0.42,
        normalMap: stippleNormal,
        normalScale: new THREE.Vector2(0.18, 0.18),
      }),
    );

    this.paintedSlate = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x303740,
        roughness: 0.46,
        metalness: 0.62,
        normalMap: brushedNormal,
        normalScale: new THREE.Vector2(0.16, 0.16),
      }),
    );

    this.opticGlass = this.reg(
      new THREE.MeshPhysicalMaterial({
        color: 0x1b3a4b,
        roughness: 0.06,
        metalness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        ior: 1.52,
        transparent: true,
        opacity: 0.68,
        emissive: 0x0b2d30,
        emissiveIntensity: 0.3,
      }),
    );

    this.reticleGreen = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: 0x22c55e,
        emissiveIntensity: 1.1,
        roughness: 0.3,
        metalness: 0.1,
      }),
    );

    this.reticleAmber = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.1,
        roughness: 0.3,
        metalness: 0.1,
      }),
    );

    this.shellRed = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x8b2c2c,
        roughness: 0.64,
        metalness: 0.1,
      }),
    );

    this.brassDetail = this.reg(
      new THREE.MeshStandardMaterial({
        color: 0x9b824e,
        roughness: 0.28,
        metalness: 0.86,
      }),
    );
  }

  private reg<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  public dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures = [];
    this.materials = [];
  }
}

export interface WeaponAssemblyInfo {
  muzzleZ: number;
  muzzleY: number;
  adsOffsetX: number;
  adsOffsetY: number;
  adsOffsetZ: number;
}

export const WEAPON_ASSEMBLY_META: Record<WeaponModelId, WeaponAssemblyInfo> = {
  vx47: {
    muzzleZ: -0.58,
    muzzleY: 0.032,
    adsOffsetX: 0.0,
    adsOffsetY: -0.095,
    adsOffsetZ: -0.34,
  },
  mr12: {
    muzzleZ: -0.72,
    muzzleY: 0.032,
    adsOffsetX: 0.0,
    adsOffsetY: -0.105,
    adsOffsetZ: -0.32,
  },
  sg8: {
    muzzleZ: -0.62,
    muzzleY: 0.032,
    adsOffsetX: 0.0,
    adsOffsetY: -0.088,
    adsOffsetZ: -0.35,
  },
  p9: {
    muzzleZ: -0.26,
    muzzleY: 0.036,
    adsOffsetX: 0.0,
    adsOffsetY: -0.085,
    adsOffsetZ: -0.38,
  },
};

/**
 * Builds shared procedural geometries once and constructs lightweight cloneable
 * THREE.Group assemblies for all 4 weapons across 1P and 3P views.
 */
export class WeaponModelsFactory {
  public readonly materials: WeaponMaterialLibrary;
  private geometries: THREE.BufferGeometry[] = [];
  private prototypes = new Map<WeaponModelId, THREE.Group>();

  constructor(maxAnisotropy: number) {
    this.materials = new WeaponMaterialLibrary(maxAnisotropy);
    this.prototypes.set('vx47', this.buildVX47Carbine());
    this.prototypes.set('mr12', this.buildMR12Marksman());
    this.prototypes.set('sg8', this.buildSG8Breacher());
    this.prototypes.set('p9', this.buildP9Tactical());
  }

  public createInstance(id: WeaponModelId, castShadow = false): THREE.Group {
    const proto = this.prototypes.get(id) ?? this.prototypes.get('vx47')!;
    const clone = proto.clone(true);
    if (castShadow) {
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
    }
    return clone;
  }

  private reg<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  /**
   * Extrude a 2D side-profile (defined in Z = horizontal forward-negative, Y = up)
   * centered symmetrically along X with crisp bevels.
   */
  private extrudeSideProfile(
    points: Array<[number, number]>,
    widthX: number,
    bevel = 0.005,
    curveSegments = 4,
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    // Map input [z, y] -> shape (x = -z, y = y) so rotating Y by +90deg aligns -Z forward
    shape.moveTo(-points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(-points[i][0], points[i][1]);
    }
    shape.closePath();

    const depth = Math.max(0.004, widthX - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments,
    });
    // Center along Z of extrude, then rotate +PI/2 around Y so shape +X maps to -Z (forward)
    geo.translate(0, 0, -depth * 0.5);
    geo.rotateY(Math.PI * 0.5);
    geo.computeVertexNormals();
    return this.reg(geo);
  }

  private addCylinderZ(
    parent: THREE.Group,
    rTop: number,
    rBot: number,
    length: number,
    zCenter: number,
    yCenter: number,
    xCenter: number,
    mat: THREE.Material,
    radialSegments = 12,
  ): THREE.Mesh {
    const geo = this.reg(new THREE.CylinderGeometry(rTop, rBot, length, radialSegments));
    geo.rotateX(Math.PI * 0.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(xCenter, yCenter, zCenter);
    parent.add(mesh);
    return mesh;
  }

  private addPicatinnyRail(
    parent: THREE.Group,
    zStart: number,
    zEnd: number,
    yBase: number,
    width: number,
    mat: THREE.Material,
  ): void {
    const len = Math.abs(zEnd - zStart);
    const zMid = (zStart + zEnd) * 0.5;
    const spine = this.extrudeSideProfile(
      [
        [zMid + len * 0.5, yBase],
        [zMid - len * 0.5, yBase],
        [zMid - len * 0.5, yBase + 0.009],
        [zMid + len * 0.5, yBase + 0.009],
      ],
      width,
      0.002,
    );
    parent.add(new THREE.Mesh(spine, mat));

    // Segmented cross-slots along rail
    const toothCount = Math.max(3, Math.floor(len / 0.022));
    const toothGeo = this.reg(new THREE.BoxGeometry(width + 0.003, 0.005, 0.01));
    for (let i = 0; i < toothCount; i++) {
      const t = (i + 0.5) / toothCount;
      const tooth = new THREE.Mesh(toothGeo, mat);
      tooth.position.set(0, yBase + 0.011, THREE.MathUtils.lerp(zStart, zEnd, t));
      parent.add(tooth);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. VX-47 Carbine (Modular Tactical Assault Rifle)
  // ---------------------------------------------------------------------------
  private buildVX47Carbine(): THREE.Group {
    const root = new THREE.Group();
    const m = this.materials;

    // Upper & Lower Receiver with beveled chamfered contour
    const upperGeo = this.extrudeSideProfile(
      [
        [0.09, 0.002],
        [-0.12, 0.002],
        [-0.12, 0.056],
        [-0.09, 0.062],
        [0.07, 0.062],
        [0.09, 0.044],
      ],
      0.046,
      0.005,
    );
    root.add(new THREE.Mesh(upperGeo, m.paintedTan));

    const lowerGeo = this.extrudeSideProfile(
      [
        [0.088, -0.036],
        [0.01, -0.036],
        [-0.015, -0.056],
        [-0.085, -0.056],
        [-0.115, -0.022],
        [-0.115, 0.006],
        [0.088, 0.006],
      ],
      0.044,
      0.004,
    );
    root.add(new THREE.Mesh(lowerGeo, m.anodizedDark));

    // Brushed ejection port & charging handle
    const portGeo = this.reg(new THREE.BoxGeometry(0.006, 0.02, 0.068));
    const port = new THREE.Mesh(portGeo, m.brushedMetal);
    port.position.set(0.023, 0.032, -0.02);
    root.add(port);

    const handleGeo = this.extrudeSideProfile(
      [
        [0.105, 0.046],
        [0.082, 0.046],
        [0.082, 0.058],
        [0.105, 0.058],
      ],
      0.058,
      0.003,
    );
    root.add(new THREE.Mesh(handleGeo, m.brushedMetal));

    // Trigger guard & curved trigger
    const guardGeo = this.extrudeSideProfile(
      [
        [0.045, -0.034],
        [0.045, -0.064],
        [-0.012, -0.064],
        [-0.012, -0.034],
        [-0.004, -0.034],
        [-0.004, -0.056],
        [0.037, -0.056],
        [0.037, -0.034],
      ],
      0.014,
      0.002,
    );
    root.add(new THREE.Mesh(guardGeo, m.anodizedDark));

    const triggerGeo = this.extrudeSideProfile(
      [
        [0.025, -0.032],
        [0.016, -0.032],
        [0.022, -0.052],
        [0.029, -0.05],
      ],
      0.006,
      0.001,
    );
    root.add(new THREE.Mesh(triggerGeo, m.brushedMetal));

    // Ergonomic angled rubberized Pistol Grip
    const gripGeo = this.extrudeSideProfile(
      [
        [0.086, -0.032],
        [0.048, -0.034],
        [0.078, -0.145],
        [0.116, -0.138],
      ],
      0.034,
      0.006,
    );
    root.add(new THREE.Mesh(gripGeo, m.rubberGrip));

    // Telescoping Carbine Stock: Buffer tube + angled stock body + rubber buttpad
    this.addCylinderZ(root, 0.018, 0.018, 0.21, 0.19, 0.024, 0, m.brushedMetal, 12);
    const stockBody = this.extrudeSideProfile(
      [
        [0.31, -0.048],
        [0.16, 0.002],
        [0.16, 0.046],
        [0.31, 0.046],
      ],
      0.036,
      0.005,
    );
    root.add(new THREE.Mesh(stockBody, m.polymerMatte));

    const buttpad = this.extrudeSideProfile(
      [
        [0.326, -0.054],
        [0.308, -0.054],
        [0.308, 0.048],
        [0.326, 0.048],
      ],
      0.04,
      0.005,
    );
    root.add(new THREE.Mesh(buttpad, m.rubberGrip));

    // Chamfered M-LOK Handguard (octagonal cylinder + cooling vents)
    const handguardGeo = this.reg(new THREE.CylinderGeometry(0.032, 0.034, 0.26, 8));
    handguardGeo.rotateX(Math.PI * 0.5);
    const handguard = new THREE.Mesh(handguardGeo, m.paintedTan);
    handguard.position.set(0, 0.024, -0.25);
    root.add(handguard);

    // Full-length top Picatinny Rail
    this.addPicatinnyRail(root, 0.06, -0.37, 0.06, 0.024, m.anodizedDark);

    // Curved 30-round Polymer Magazine + floorplate
    const magGeo = this.extrudeSideProfile(
      [
        [-0.02, -0.05],
        [-0.075, -0.05],
        [-0.088, -0.13],
        [-0.105, -0.2],
        [-0.05, -0.212],
        [-0.032, -0.135],
      ],
      0.028,
      0.004,
    );
    root.add(new THREE.Mesh(magGeo, m.polymerMatte));

    // Stepped Heavy Barrel + Gas Block + 3-Prong Flash Hider (LatheGeometry)
    this.addCylinderZ(root, 0.013, 0.014, 0.21, -0.45, 0.032, 0, m.brushedMetal, 12);
    this.addCylinderZ(root, 0.017, 0.017, 0.026, -0.4, 0.034, 0, m.anodizedDark, 8);

    const flashPoints = [
      new THREE.Vector2(0.008, 0.0),
      new THREE.Vector2(0.016, 0.0),
      new THREE.Vector2(0.016, 0.018),
      new THREE.Vector2(0.012, 0.024),
      new THREE.Vector2(0.018, 0.03),
      new THREE.Vector2(0.018, 0.058),
      new THREE.Vector2(0.011, 0.058),
    ];
    const flashGeo = this.reg(new THREE.LatheGeometry(flashPoints, 12));
    flashGeo.rotateX(-Math.PI * 0.5);
    const flashHider = new THREE.Mesh(flashGeo, m.brushedMetal);
    flashHider.position.set(0, 0.032, -0.53);
    root.add(flashHider);

    // Chamfered Reflex Holographic Optic Shroud + Recessed Glass Lens + Green Reticle
    const opticMount = this.extrudeSideProfile(
      [
        [0.042, 0.07],
        [-0.042, 0.07],
        [-0.042, 0.083],
        [0.042, 0.083],
      ],
      0.036,
      0.002,
    );
    root.add(new THREE.Mesh(opticMount, m.anodizedDark));

    const hoodSideGeo = this.extrudeSideProfile(
      [
        [0.032, 0.083],
        [-0.032, 0.083],
        [-0.024, 0.118],
        [0.024, 0.118],
      ],
      0.005,
      0.0015,
    );
    const hL = new THREE.Mesh(hoodSideGeo, m.polymerMatte);
    hL.position.x = -0.0165;
    const hR = new THREE.Mesh(hoodSideGeo, m.polymerMatte);
    hR.position.x = 0.0165;
    const hoodTop = this.extrudeSideProfile(
      [
        [0.025, 0.113],
        [-0.025, 0.113],
        [-0.022, 0.119],
        [0.022, 0.119],
      ],
      0.038,
      0.0015,
    );
    root.add(hL, hR, new THREE.Mesh(hoodTop, m.polymerMatte));

    const lensGeo = this.reg(new THREE.PlaneGeometry(0.026, 0.024));
    const lens = new THREE.Mesh(lensGeo, m.opticGlass);
    lens.position.set(0, 0.098, -0.012);
    root.add(lens);

    const dotGeo = this.reg(new THREE.SphereGeometry(0.002, 6, 6));
    const dot = new THREE.Mesh(dotGeo, m.reticleGreen);
    dot.position.set(0, 0.098, -0.011);
    root.add(dot);

    // Brass receiver pins & fire selector detail
    const pinGeo = this.reg(new THREE.CylinderGeometry(0.003, 0.003, 0.048, 8));
    pinGeo.rotateZ(Math.PI * 0.5);
    const pin1 = new THREE.Mesh(pinGeo, m.brassDetail);
    pin1.position.set(0, -0.012, 0.055);
    const pin2 = new THREE.Mesh(pinGeo, m.brassDetail);
    pin2.position.set(0, -0.012, -0.075);
    root.add(pin1, pin2);

    return root;
  }

  // ---------------------------------------------------------------------------
  // 2. MR-12 Marksman (Precision Designated Marksman Rifle)
  // ---------------------------------------------------------------------------
  private buildMR12Marksman(): THREE.Group {
    const root = new THREE.Group();
    const m = this.materials;

    // Elongated Olive-Drab Precision Receiver Chassis
    const chassisGeo = this.extrudeSideProfile(
      [
        [0.11, -0.03],
        [-0.14, -0.045],
        [-0.14, 0.058],
        [0.09, 0.058],
        [0.11, 0.036],
      ],
      0.046,
      0.005,
    );
    root.add(new THREE.Mesh(chassisGeo, m.paintedOlive));

    // Brushed Steel Bolt Carrier & Bolt Handle
    const boltGeo = this.reg(new THREE.CylinderGeometry(0.011, 0.011, 0.09, 10));
    boltGeo.rotateX(Math.PI * 0.5);
    const bolt = new THREE.Mesh(boltGeo, m.brushedMetal);
    bolt.position.set(0.018, 0.032, -0.01);
    root.add(bolt);

    const boltKnob = this.reg(new THREE.SphereGeometry(0.009, 8, 8));
    const knob = new THREE.Mesh(boltKnob, m.brushedMetal);
    knob.position.set(0.042, 0.025, 0.02);
    root.add(knob);

    // Skeletonized Precision Sniper Stock with Cheek Riser & Rubber Pad
    const stockTop = this.extrudeSideProfile(
      [
        [0.33, 0.018],
        [0.11, 0.018],
        [0.11, 0.048],
        [0.33, 0.048],
      ],
      0.034,
      0.004,
    );
    const stockBot = this.extrudeSideProfile(
      [
        [0.33, -0.055],
        [0.11, -0.026],
        [0.11, -0.008],
        [0.33, -0.032],
      ],
      0.026,
      0.003,
    );
    const cheekRiser = this.extrudeSideProfile(
      [
        [0.29, 0.048],
        [0.16, 0.048],
        [0.16, 0.072],
        [0.29, 0.072],
      ],
      0.038,
      0.005,
    );
    const pad = this.extrudeSideProfile(
      [
        [0.35, -0.06],
        [0.328, -0.06],
        [0.328, 0.052],
        [0.35, 0.052],
      ],
      0.038,
      0.004,
    );
    root.add(
      new THREE.Mesh(stockTop, m.paintedOlive),
      new THREE.Mesh(stockBot, m.anodizedDark),
      new THREE.Mesh(cheekRiser, m.rubberGrip),
      new THREE.Mesh(pad, m.rubberGrip),
    );

    // Match Vertical Grip & Trigger Guard
    const gripGeo = this.extrudeSideProfile(
      [
        [0.095, -0.028],
        [0.055, -0.032],
        [0.072, -0.145],
        [0.112, -0.142],
      ],
      0.034,
      0.006,
    );
    root.add(new THREE.Mesh(gripGeo, m.rubberGrip));

    const guardGeo = this.extrudeSideProfile(
      [
        [0.052, -0.03],
        [0.052, -0.062],
        [-0.008, -0.062],
        [-0.008, -0.03],
        [0, -0.03],
        [0, -0.054],
        [0.044, -0.054],
        [0.044, -0.03],
      ],
      0.014,
      0.002,
    );
    root.add(new THREE.Mesh(guardGeo, m.anodizedDark));

    // Straight 10-round 7.62mm Magazine
    const magGeo = this.extrudeSideProfile(
      [
        [-0.025, -0.042],
        [-0.095, -0.042],
        [-0.098, -0.145],
        [-0.028, -0.145],
      ],
      0.028,
      0.003,
    );
    root.add(new THREE.Mesh(magGeo, m.anodizedDark));

    // Free-Float Octagonal Chassis Handguard + Folded Bipod
    const hgGeo = this.reg(new THREE.CylinderGeometry(0.032, 0.035, 0.34, 8));
    hgGeo.rotateX(Math.PI * 0.5);
    const hg = new THREE.Mesh(hgGeo, m.paintedOlive);
    hg.position.set(0, 0.024, -0.31);
    root.add(hg);

    this.addPicatinnyRail(root, 0.08, -0.47, 0.058, 0.024, m.anodizedDark);

    // Folded bipod legs under handguard
    this.addCylinderZ(root, 0.007, 0.007, 0.17, -0.35, -0.014, -0.022, m.brushedMetal, 8);
    this.addCylinderZ(root, 0.007, 0.007, 0.17, -0.35, -0.014, 0.022, m.brushedMetal, 8);

    // Long Match Barrel + Multi-Chamber Muzzle Brake
    this.addCylinderZ(root, 0.014, 0.015, 0.25, -0.57, 0.032, 0, m.brushedMetal, 12);
    const brakeGeo = this.extrudeSideProfile(
      [
        [-0.67, 0.016],
        [-0.74, 0.016],
        [-0.74, 0.048],
        [-0.67, 0.048],
      ],
      0.034,
      0.004,
    );
    root.add(new THREE.Mesh(brakeGeo, m.brushedMetal));

    // Variable Marksman Scope (LatheGeometry stepped tube + dual rings + front/rear optical glass)
    const scopePoints = [
      new THREE.Vector2(0.022, 0.0),
      new THREE.Vector2(0.022, 0.055),
      new THREE.Vector2(0.015, 0.072),
      new THREE.Vector2(0.015, 0.165),
      new THREE.Vector2(0.026, 0.195),
      new THREE.Vector2(0.026, 0.255),
      new THREE.Vector2(0.022, 0.255),
    ];
    const scopeGeo = this.reg(new THREE.LatheGeometry(scopePoints, 14));
    scopeGeo.rotateX(-Math.PI * 0.5);
    const scope = new THREE.Mesh(scopeGeo, m.anodizedDark);
    scope.position.set(0, 0.105, 0.09);
    root.add(scope);

    // Scope mounting rings + turret dials
    const ringGeo = this.reg(new THREE.CylinderGeometry(0.02, 0.02, 0.022, 12));
    ringGeo.rotateX(Math.PI * 0.5);
    const r1 = new THREE.Mesh(ringGeo, m.brushedMetal);
    r1.position.set(0, 0.105, 0.005);
    const r2 = new THREE.Mesh(ringGeo, m.brushedMetal);
    r2.position.set(0, 0.105, -0.065);
    root.add(r1, r2);

    const turretTop = new THREE.Mesh(
      this.reg(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 10)),
      m.brushedMetal,
    );
    turretTop.position.set(0, 0.128, -0.03);
    root.add(turretTop);

    // Rear & Front Coated Optical Lenses recessed inside Bezel Rings
    const rearBezel = new THREE.Mesh(
      this.reg(new THREE.TorusGeometry(0.02, 0.0032, 8, 16)),
      m.polymerMatte,
    );
    rearBezel.position.set(0, 0.105, 0.091);

    const rearLens = new THREE.Mesh(
      this.reg(new THREE.CircleGeometry(0.0185, 14)),
      m.opticGlass,
    );
    rearLens.position.set(0, 0.105, 0.088);

    const frontBezel = new THREE.Mesh(
      this.reg(new THREE.TorusGeometry(0.024, 0.0035, 8, 16)),
      m.polymerMatte,
    );
    frontBezel.position.set(0, 0.105, -0.165);

    const frontLens = new THREE.Mesh(
      this.reg(new THREE.CircleGeometry(0.0225, 14)),
      m.opticGlass,
    );
    frontLens.rotation.y = Math.PI;
    frontLens.position.set(0, 0.105, -0.162);
    root.add(rearBezel, rearLens, frontBezel, frontLens);

    return root;
  }

  // ---------------------------------------------------------------------------
  // 3. SG-8 Breacher (Tactical Pump-Action Shotgun)
  // ---------------------------------------------------------------------------
  private buildSG8Breacher(): THREE.Group {
    const root = new THREE.Group();
    const m = this.materials;

    // Rounded-spine Parkerized Steel Receiver
    const recGeo = this.extrudeSideProfile(
      [
        [0.09, -0.026],
        [-0.12, -0.026],
        [-0.12, 0.056],
        [0.06, 0.056],
        [0.09, 0.036],
      ],
      0.048,
      0.008,
    );
    root.add(new THREE.Mesh(recGeo, m.paintedSlate));

    // Side ejection port (brushed steel) & shell side-saddle
    const port = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.006, 0.022, 0.072)),
      m.brushedMetal,
    );
    port.position.set(0.024, 0.026, -0.02);
    root.add(port);

    // 4 spare 12-gauge shells mounted on side-saddle (distinct visual detail)
    const shellBodyGeo = this.reg(new THREE.CylinderGeometry(0.008, 0.008, 0.042, 8));
    const shellBrassGeo = this.reg(new THREE.CylinderGeometry(0.0084, 0.0084, 0.012, 8));
    for (let i = 0; i < 4; i++) {
      const sz = 0.03 - i * 0.022;
      const sh = new THREE.Mesh(shellBodyGeo, m.shellRed);
      sh.position.set(-0.028, 0.016, sz);
      const br = new THREE.Mesh(shellBrassGeo, m.brassDetail);
      br.position.set(-0.028, -0.008, sz);
      root.add(sh, br);
    }

    // Swept Tactical Shotgun Stock + Integrated Grip
    const stockGeo = this.extrudeSideProfile(
      [
        [0.34, -0.088],
        [0.14, -0.028],
        [0.11, -0.105],
        [0.076, -0.098],
        [0.082, -0.02],
        [0.34, 0.012],
      ],
      0.038,
      0.007,
    );
    root.add(new THREE.Mesh(stockGeo, m.polymerMatte));

    const buttpad = this.extrudeSideProfile(
      [
        [0.358, -0.092],
        [0.338, -0.092],
        [0.338, 0.014],
        [0.358, 0.014],
      ],
      0.04,
      0.005,
    );
    root.add(new THREE.Mesh(buttpad, m.rubberGrip));

    // Trigger guard & curved trigger
    const guardGeo = this.extrudeSideProfile(
      [
        [0.055, -0.024],
        [0.055, -0.056],
        [-0.005, -0.056],
        [-0.005, -0.024],
        [0.003, -0.024],
        [0.003, -0.048],
        [0.047, -0.048],
        [0.047, -0.024],
      ],
      0.014,
      0.002,
    );
    root.add(new THREE.Mesh(guardGeo, m.anodizedDark));

    // Heavy 12G Barrel + Full-Length Underbarrel Tubular Magazine
    this.addCylinderZ(root, 0.017, 0.018, 0.5, -0.37, 0.032, 0, m.brushedMetal, 14);
    this.addCylinderZ(root, 0.014, 0.014, 0.44, -0.34, -0.004, 0, m.anodizedDark, 12);

    // Barrel-to-tube clamp collar + ported choke tip
    const clamp = this.extrudeSideProfile(
      [
        [-0.51, -0.02],
        [-0.535, -0.02],
        [-0.535, 0.048],
        [-0.51, 0.048],
      ],
      0.034,
      0.003,
    );
    root.add(new THREE.Mesh(clamp, m.anodizedDark));
    this.addCylinderZ(root, 0.02, 0.018, 0.038, -0.61, 0.032, 0, m.brushedMetal, 12);

    // Ribbed Ergonomic Pump-Action Forend (LatheGeometry with 5 tactile grooves)
    const pumpPoints: THREE.Vector2[] = [new THREE.Vector2(0.015, 0.0)];
    const pumpLen = 0.19;
    const ribs = 6;
    for (let i = 0; i <= ribs * 2; i++) {
      const y = (i / (ribs * 2)) * pumpLen;
      const r = i % 2 === 0 ? 0.024 : 0.0285;
      pumpPoints.push(new THREE.Vector2(r, y));
    }
    pumpPoints.push(new THREE.Vector2(0.015, pumpLen));
    const pumpGeo = this.reg(new THREE.LatheGeometry(pumpPoints, 12));
    pumpGeo.rotateX(-Math.PI * 0.5);
    const pump = new THREE.Mesh(pumpGeo, m.rubberGrip);
    pump.position.set(0, -0.004, -0.22);
    root.add(pump);

    // Top Tactical Rail + Ghost-Ring Rear Sight + Amber Fiber Front Blade
    this.addPicatinnyRail(root, 0.04, -0.11, 0.056, 0.022, m.anodizedDark);
    const ghostRing = new THREE.Mesh(
      this.reg(new THREE.TorusGeometry(0.011, 0.003, 6, 12)),
      m.anodizedDark,
    );
    ghostRing.position.set(0, 0.082, 0.02);
    root.add(ghostRing);

    const frontBase = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.01, 0.016, 0.022)),
      m.anodizedDark,
    );
    frontBase.position.set(0, 0.055, -0.57);
    const fiberTip = new THREE.Mesh(
      this.reg(new THREE.SphereGeometry(0.0032, 6, 6)),
      m.reticleAmber,
    );
    fiberTip.position.set(0, 0.066, -0.57);
    root.add(frontBase, fiberTip);

    return root;
  }

  // ---------------------------------------------------------------------------
  // 4. P-9 Tactical (Modern Combat Sidearm)
  // ---------------------------------------------------------------------------
  private buildP9Tactical(): THREE.Group {
    const root = new THREE.Group();
    const m = this.materials;

    // Matte Polymer Frame with Dustcover Rail & Beaver-tail Tang
    const frameGeo = this.extrudeSideProfile(
      [
        [0.095, 0.024],
        [0.065, 0.004],
        [-0.145, 0.004],
        [-0.145, 0.024],
        [0.095, 0.024],
      ],
      0.032,
      0.004,
    );
    root.add(new THREE.Mesh(frameGeo, m.polymerMatte));

    // Ergonomic Contoured Pistol Grip + Flared Magwell
    const gripGeo = this.extrudeSideProfile(
      [
        [0.072, 0.01],
        [0.018, 0.006],
        [0.042, -0.108],
        [0.096, -0.102],
      ],
      0.032,
      0.005,
    );
    root.add(new THREE.Mesh(gripGeo, m.rubberGrip));

    // Magazine Floorplate Bumper protruding cleanly from magwell
    const magPlate = this.extrudeSideProfile(
      [
        [0.098, -0.102],
        [0.042, -0.108],
        [0.046, -0.122],
        [0.102, -0.116],
      ],
      0.03,
      0.003,
    );
    root.add(new THREE.Mesh(magPlate, m.anodizedDark));

    // Trigger Guard & Curved Trigger
    const guardGeo = this.extrudeSideProfile(
      [
        [0.026, 0.006],
        [0.026, -0.034],
        [-0.038, -0.034],
        [-0.038, 0.006],
        [-0.03, 0.006],
        [-0.03, -0.026],
        [0.018, -0.026],
        [0.018, 0.006],
      ],
      0.012,
      0.002,
    );
    root.add(new THREE.Mesh(guardGeo, m.polymerMatte));

    const triggerGeo = this.extrudeSideProfile(
      [
        [0.004, 0.004],
        [-0.005, 0.004],
        [0.003, -0.02],
        [0.01, -0.018],
      ],
      0.005,
      0.001,
    );
    root.add(new THREE.Mesh(triggerGeo, m.brushedMetal));

    // Chamfered Brushed-Metal Slide
    const slideGeo = this.extrudeSideProfile(
      [
        [0.088, 0.024],
        [-0.15, 0.024],
        [-0.15, 0.056],
        [-0.135, 0.064],
        [0.08, 0.064],
        [0.088, 0.054],
      ],
      0.034,
      0.004,
    );
    root.add(new THREE.Mesh(slideGeo, m.brushedMetal));

    // Crowned Threaded Barrel Tip protruding slightly from front of slide
    this.addCylinderZ(root, 0.01, 0.01, 0.036, -0.165, 0.042, 0, m.anodizedDark, 12);

    // Underbarrel Tactical Laser / Flashlight Module
    this.addCylinderZ(root, 0.012, 0.012, 0.072, -0.1, -0.01, 0, m.anodizedDark, 10);
    const tacLens = new THREE.Mesh(
      this.reg(new THREE.CircleGeometry(0.01, 10)),
      m.opticGlass,
    );
    tacLens.rotation.y = Math.PI;
    tacLens.position.set(0, -0.01, -0.137);
    root.add(tacLens);

    // Micro Red-Dot Pistol Optic + Iron Sight Posts
    const mrdFrame = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.028, 0.007, 0.044)),
      m.anodizedDark,
    );
    mrdFrame.position.set(0, 0.067, 0.032);
    const mrdL = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.004, 0.022, 0.034)),
      m.anodizedDark,
    );
    mrdL.position.set(-0.012, 0.08, 0.032);
    const mrdR = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.004, 0.022, 0.034)),
      m.anodizedDark,
    );
    mrdR.position.set(0.012, 0.08, 0.032);
    const mrdTop = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.028, 0.004, 0.034)),
      m.anodizedDark,
    );
    mrdTop.position.set(0, 0.091, 0.032);
    root.add(mrdFrame, mrdL, mrdR, mrdTop);

    const pGlass = new THREE.Mesh(
      this.reg(new THREE.PlaneGeometry(0.02, 0.018)),
      m.opticGlass,
    );
    pGlass.position.set(0, 0.08, 0.024);
    const pDot = new THREE.Mesh(
      this.reg(new THREE.SphereGeometry(0.0018, 6, 6)),
      m.reticleAmber,
    );
    pDot.position.set(0, 0.08, 0.025);
    root.add(pGlass, pDot);

    // Front iron sight blade & slide stop lever detail
    const frontPost = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.005, 0.012, 0.014)),
      m.anodizedDark,
    );
    frontPost.position.set(0, 0.07, -0.135);
    const frontDot = new THREE.Mesh(
      this.reg(new THREE.SphereGeometry(0.002, 6, 6)),
      m.reticleGreen,
    );
    frontDot.position.set(0, 0.072, -0.128);
    root.add(frontPost, frontDot);

    const slideStop = new THREE.Mesh(
      this.reg(new THREE.BoxGeometry(0.004, 0.008, 0.024)),
      m.brassDetail,
    );
    slideStop.position.set(-0.018, 0.02, 0.01);
    root.add(slideStop);

    return root;
  }

  public dispose(): void {
    this.prototypes.clear();
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.materials.dispose();
  }
}
