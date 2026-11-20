import * as THREE from 'three';
import { BiomeZone } from '../types/game';
import { MaterialLibrary } from './Materials';

export const ISLAND_SIZE = 360;
export const TERRAIN_SEGMENTS = 128;
export const ISLAND_PLAYABLE_RADIUS = 165;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getZoneAt(x: number, z: number): BiomeZone {
  if (x < 0 && z < 0) return 'urban';
  if (x >= 0 && z < 0) return 'industrial';
  if (x < 0 && z >= 0) return 'forest';
  return 'mountain';
}

export function getTerrainHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);

  // Island coastal shelf & surrounding sea floor
  const coastFalloff = 1.0 - smoothstep(142, 178, dist);
  if (coastFalloff <= 0.001) {
    return -3.2;
  }

  // Gentle organic undulation across the whole island
  const baseHills =
    Math.sin(x * 0.032) * Math.cos(z * 0.028) * 1.4 +
    Math.sin((x + z) * 0.065) * 0.55;

  // Quadrant blend weights (smooth 26m transition band around axes)
  const wUrban = smoothstep(14, -14, x) * smoothstep(14, -14, z);
  const wIndustrial = smoothstep(-14, 14, x) * smoothstep(14, -14, z);
  const wForest = smoothstep(14, -14, x) * smoothstep(-14, 14, z);
  const wMountain = smoothstep(-14, 14, x) * smoothstep(-14, 14, z);

  // Urban NW: flat paved town plateau at y = 2.0
  const hUrban = 2.0;

  // Industrial NE: flat concrete yard at y = 2.2
  const hIndustrial = 2.2;

  // Forest SW: rolling hills 2.4 - 6.8m
  const hForest =
    3.6 +
    Math.sin(x * 0.048 + 0.7) * Math.cos(z * 0.052) * 2.1 +
    Math.sin(x * 0.11 - z * 0.09) * 0.65;

  // Mountain SE: elevated summit ridge centered around (76, 76) with navigable slopes
  const mDist = Math.hypot(x - 76, z - 76);
  const peak = Math.max(0, 1 - mDist / 84);
  const ridge =
    Math.pow(peak, 1.45) * 16.5 +
    Math.sin(x * 0.09) * Math.cos(z * 0.085) * 1.15;
  const hMountain = 3.2 + ridge;

  const weightSum = Math.max(0.0001, wUrban + wIndustrial + wForest + wMountain);
  const blended =
    (wUrban * hUrban +
      wIndustrial * hIndustrial +
      wForest * hForest +
      wMountain * hMountain) /
      weightSum +
    baseHills * (1 - Math.min(1, wUrban + wIndustrial));

  return -3.2 + (blended + 3.2) * coastFalloff;
}

export function getTerrainNormal(x: number, z: number): THREE.Vector3 {
  const eps = 0.6;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
}

export class TerrainSystem {
  public readonly mesh: THREE.Mesh;
  public readonly waterMesh: THREE.Mesh;

  constructor(materials: MaterialLibrary) {
    const geo = new THREE.PlaneGeometry(
      ISLAND_SIZE,
      ISLAND_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xb6a98a);
    const cGrass = new THREE.Color(0x4e6442);
    const cForestFloor = new THREE.Color(0x3b4f34);
    const cUrban = new THREE.Color(0x6b7175);
    const cIndustrial = new THREE.Color(0x5d646b);
    const cRock = new THREE.Color(0x686e73);
    const cTemp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      const dist = Math.hypot(x, z);
      const zone = getZoneAt(x, z);

      if (y < 0.85 || dist > 152) {
        cTemp.copy(cSand);
      } else if (zone === 'urban') {
        cTemp.copy(cUrban).lerp(cGrass, 0.28);
      } else if (zone === 'industrial') {
        cTemp.copy(cIndustrial).lerp(cRock, 0.25);
      } else if (zone === 'forest') {
        const patch = 0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.07);
        cTemp.copy(cForestFloor).lerp(cGrass, patch);
      } else {
        const rockBlend = smoothstep(5.5, 11.5, y);
        cTemp.copy(cGrass).lerp(cRock, rockBlend);
      }

      colors[i * 3] = cTemp.r;
      colors[i * 3 + 1] = cTemp.g;
      colors[i * 3 + 2] = cTemp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.mesh = new THREE.Mesh(geo, materials.terrain);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;

    // Surrounding coastal sea plane extending into horizon fog
    const waterGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(waterGeo, materials.water);
    this.waterMesh.position.y = 0.0;
    this.waterMesh.receiveShadow = true;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.waterMesh.geometry.dispose();
  }
}
