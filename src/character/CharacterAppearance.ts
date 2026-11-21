import * as THREE from 'three';
import type { CharacterAppearanceConfig } from './CharacterTypes';

function createRipstopNormalTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const gridX = x % 8 === 0 ? 18 : 0;
        const gridY = y % 8 === 0 ? 18 : 0;
        const weave = ((x + y) % 2 === 0 ? 1 : -1) * 7;
        d[idx] = Math.max(0, Math.min(255, 128 + weave + gridX));
        d[idx + 1] = Math.max(0, Math.min(255, 128 - weave + gridY));
        d[idx + 2] = 245;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.needsUpdate = true;
  return tex;
}

export class CharacterAppearanceLibrary {
  private fabricNormal: THREE.CanvasTexture;
  private allMaterials: THREE.Material[] = [];

  private jacketMats: THREE.MeshStandardMaterial[];
  private pantsMats: THREE.MeshStandardMaterial[];
  private helmetMats: THREE.MeshStandardMaterial[];
  private vestMats: THREE.MeshStandardMaterial[];
  private backpackMats: THREE.MeshStandardMaterial[];
  private skinMats: THREE.MeshStandardMaterial[];

  public readonly bootsMat: THREE.MeshStandardMaterial;
  public readonly glovesMat: THREE.MeshStandardMaterial;
  public readonly balaclavaMat: THREE.MeshStandardMaterial;
  public readonly gogglesMat: THREE.MeshPhysicalMaterial;

  constructor(maxAnisotropy: number) {
    this.fabricNormal = createRipstopNormalTexture(64);
    this.fabricNormal.anisotropy = Math.min(4, Math.max(1, maxAnisotropy));

    const mkFabric = (color: number, roughness = 0.84) =>
      this.reg(
        new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: 0.04,
          normalMap: this.fabricNormal,
          normalScale: new THREE.Vector2(0.32, 0.32),
        }),
      );

    const mkGear = (color: number, roughness = 0.56, metalness = 0.16) =>
      this.reg(
        new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness,
        }),
      );

    this.jacketMats = [
      mkFabric(0x3a463b), // Ranger Olive
      mkFabric(0x4a4538), // Field Khaki
      mkFabric(0x323942), // Urban Slate
      mkFabric(0x282d33), // Night Charcoal
      mkFabric(0x52463a), // Arid Coyote
    ];

    this.pantsMats = [
      mkFabric(0x2d322d, 0.88),
      mkFabric(0x3b3830, 0.88),
      mkFabric(0x272c33, 0.88),
      mkFabric(0x463e34, 0.88),
    ];

    this.helmetMats = [
      mkGear(0x2d332d, 0.48, 0.22),
      mkGear(0x4c483d, 0.52, 0.18),
      mkGear(0x23272e, 0.45, 0.26),
      mkGear(0x3c434a, 0.50, 0.20),
    ];

    this.vestMats = [
      mkFabric(0x353b34, 0.80),
      mkFabric(0x4e483c, 0.80),
      mkFabric(0x23272c, 0.78),
      mkFabric(0x3d4137, 0.80),
    ];

    this.backpackMats = [
      mkFabric(0x3c4237, 0.84),
      mkFabric(0x544b3d, 0.84),
      mkFabric(0x26292e, 0.82),
    ];

    this.skinMats = [
      mkGear(0xc49576, 0.64, 0.02),
      mkGear(0xa97a5b, 0.64, 0.02),
      mkGear(0x825a43, 0.66, 0.02),
    ];

    this.bootsMat = mkGear(0x1a1c1f, 0.72, 0.08);
    this.glovesMat = mkGear(0x202429, 0.68, 0.08);
    this.balaclavaMat = mkFabric(0x191c20, 0.90);
    this.gogglesMat = this.reg(
      new THREE.MeshPhysicalMaterial({
        color: 0x16242f,
        roughness: 0.12,
        metalness: 0.32,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
      }),
    );
  }

  public getJacketMaterial(variant: number): THREE.MeshStandardMaterial {
    return this.jacketMats[Math.abs(variant) % this.jacketMats.length];
  }

  public applyToRig(root: THREE.Object3D, config: CharacterAppearanceConfig): void {
    const jacketMat = this.getJacketMaterial(config.jacketVariant);
    const pantsMat = this.pantsMats[Math.abs(config.pantsVariant) % this.pantsMats.length];
    const helmetMat = this.helmetMats[Math.abs(config.helmetVariant) % this.helmetMats.length];
    const vestMat = this.vestMats[Math.abs(config.vestVariant) % this.vestMats.length];
    const packMat = this.backpackMats[Math.abs(config.backpackVariant) % this.backpackMats.length];
    const skinMat = this.skinMats[Math.abs(config.skinVariant) % this.skinMats.length];

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      switch (obj.name) {
        case 'Body_Jacket':
        case 'FP_LeftSleeve':
        case 'FP_RightSleeve':
          obj.material = jacketMat;
          break;
        case 'Body_Pants':
          obj.material = pantsMat;
          break;
        case 'Body_Boots':
          obj.material = this.bootsMat;
          break;
        case 'Body_Gloves':
        case 'FP_LeftGlove':
        case 'FP_RightGlove':
          obj.material = this.glovesMat;
          break;
        case 'Body_Skin':
          obj.material = skinMat;
          break;
        case 'Gear_Balaclava':
          obj.material = this.balaclavaMat;
          break;
        case 'Gear_Helmet':
          obj.material = helmetMat;
          break;
        case 'Gear_Goggles':
          obj.material = this.gogglesMat;
          break;
        case 'Gear_Vest':
          obj.material = vestMat;
          break;
        case 'Gear_Backpack':
          obj.material = packMat;
          break;
      }
    });
  }

  private reg<T extends THREE.Material>(m: T): T {
    this.allMaterials.push(m);
    return m;
  }

  public dispose(): void {
    this.fabricNormal.dispose();
    this.allMaterials.forEach((m) => m.dispose());
    this.allMaterials = [];
  }
}

export const PLAYER_APPEARANCE: CharacterAppearanceConfig = {
  jacketVariant: 0, // Ranger Olive
  pantsVariant: 0,
  helmetVariant: 0,
  vestVariant: 0,
  backpackVariant: 0,
  skinVariant: 0,
  equipment: {
    helmet: false, // Synced dynamically from InventorySystem
    goggles: true,
    balaclava: true,
    vest: false, // Synced dynamically from InventorySystem
    backpack: true,
  },
};

export function createBotAppearancePreset(index: number): CharacterAppearanceConfig {
  return {
    jacketVariant: (index + 1) % 5,
    pantsVariant: (index * 2 + 1) % 4,
    helmetVariant: index % 4,
    vestVariant: (index + 2) % 4,
    backpackVariant: index % 3,
    skinVariant: index % 3,
    equipment: {
      helmet: index % 3 !== 2,
      goggles: index % 2 === 0,
      balaclava: index % 4 !== 3,
      vest: index % 5 !== 4,
      backpack: index % 2 === 1 || index % 3 === 0,
    },
  };
}
