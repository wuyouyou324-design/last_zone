import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export interface CharacterTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface CharacterAssetBundle {
  lod0: CharacterTemplate;
  lod1: CharacterTemplate;
  fpArms: CharacterTemplate;
}

export class CharacterLoader {
  private loader = new GLTFLoader();
  private bundle: CharacterAssetBundle | null = null;
  private loadPromise: Promise<CharacterAssetBundle> | null = null;

  public async loadAll(): Promise<CharacterAssetBundle> {
    if (this.bundle) return this.bundle;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = Promise.all([
      this.loadGltf('/assets/characters/tactical_operator_lod0.glb'),
      this.loadGltf('/assets/characters/tactical_operator_lod1.glb'),
      this.loadGltf('/assets/characters/fp_tactical_arms.glb'),
    ]).then(([lod0Gltf, lod1Gltf, fpArmsGltf]) => {
      const prepTemplate = (gltf: GLTF, castShadow: boolean): CharacterTemplate => {
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = castShadow;
            obj.receiveShadow = true;
            obj.frustumCulled = false;
          }
        });
        const animations = gltf.animations.map((clip) => {
          const opt = clip.clone();
          opt.optimize();
          return opt;
        });
        return { scene: gltf.scene, animations };
      };

      this.bundle = {
        lod0: prepTemplate(lod0Gltf, true),
        lod1: prepTemplate(lod1Gltf, false),
        fpArms: prepTemplate(fpArmsGltf, false),
      };
      return this.bundle;
    });

    return this.loadPromise;
  }

  public instantiate(template: CharacterTemplate): THREE.Group {
    const cloned = SkeletonUtils.clone(template.scene) as THREE.Group;
    cloned.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) {
        obj.frustumCulled = false;
      }
    });
    return cloned;
  }

  private loadGltf(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
  }

  public dispose(): void {
    if (!this.bundle) return;
    const disposeTemplate = (tpl: CharacterTemplate) => {
      tpl.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    };
    disposeTemplate(this.bundle.lod0);
    disposeTemplate(this.bundle.lod1);
    disposeTemplate(this.bundle.fpArms);
    this.bundle = null;
    this.loadPromise = null;
  }
}
