import * as THREE from 'three';
import { BiomeZone, MapId } from '../types/game';
import { MAP_CATALOG } from './MapCatalog';
import { MaterialLibrary } from './Materials';

export const ISLAND_SIZE = 360;
export const TERRAIN_SEGMENTS = 128;
export const ISLAND_PLAYABLE_RADIUS = 165;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getZoneAt(x: number, z: number, _mapId: MapId = 'emerald_island'): BiomeZone {
  if (x < 0 && z < 0) return 'urban';
  if (x >= 0 && z < 0) return 'industrial';
  if (x < 0 && z >= 0) return 'forest';
  return 'mountain';
}

function getEmeraldIslandHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);

  // Island coastal shelf & surrounding sea floor
  const coastFalloff = 1.0 - smoothstep(142, 178, dist);
  if (coastFalloff <= 0.001) {
    return -3.2;
  }

  const baseHills =
    Math.sin(x * 0.032) * Math.cos(z * 0.028) * 1.4 +
    Math.sin((x + z) * 0.065) * 0.55;

  const wUrban = smoothstep(14, -14, x) * smoothstep(14, -14, z);
  const wIndustrial = smoothstep(-14, 14, x) * smoothstep(14, -14, z);
  const wForest = smoothstep(14, -14, x) * smoothstep(-14, 14, z);
  const wMountain = smoothstep(-14, 14, x) * smoothstep(-14, 14, z);

  const hUrban = 2.0;
  const hIndustrial = 2.2;
  const hForest =
    3.6 +
    Math.sin(x * 0.048 + 0.7) * Math.cos(z * 0.052) * 2.1 +
    Math.sin(x * 0.11 - z * 0.09) * 0.65;

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

function getAridCanyonHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  if (dist > 179) {
    return 0.0;
  }

  const wUrban = smoothstep(14, -14, x) * smoothstep(14, -14, z);
  const wIndustrial = smoothstep(-14, 14, x) * smoothstep(14, -14, z);
  const wForest = smoothstep(14, -14, x) * smoothstep(-14, 14, z);
  const wMountain = smoothstep(-14, 14, x) * smoothstep(-14, 14, z);

  // NW Airfield: flat compacted runway desert plateau
  const hAirfield = 2.6;

  // NE Refinery: stepped gravel pad
  const hRefinery = 3.0;

  // SW Sandstone Canyon: winding dry riverbed flanked by eroded ridges
  const washCurve = Math.sin(x * 0.042 + 0.5) * 24 + z + 64;
  const inWash = 1 - smoothstep(8, 28, Math.abs(washCurve));
  const canyonBanks =
    4.9 +
    Math.sin(x * 0.065) * Math.cos(z * 0.055) * 1.7 +
    Math.cos((x - z) * 0.09) * 0.65;
  const hCanyon = canyonBanks * (1 - inWash * 0.65) + 1.55 * inWash;

  // SE Mesa Ridge: flat-topped terraced red-rock plateau around (76, 76)
  const mDist = Math.hypot(x - 76, z - 76);
  const mesaRamp = 1 - smoothstep(22, 68, mDist);
  const mesaStep = Math.pow(mesaRamp, 1.15) * 11.4;
  const hMesa = 3.1 + mesaStep + Math.sin(x * 0.07) * Math.cos(z * 0.07) * 0.45;

  const weightSum = Math.max(0.0001, wUrban + wIndustrial + wForest + wMountain);
  const ripples =
    Math.sin(x * 0.036 + z * 0.025) * 0.9 + Math.cos(x * 0.08 - z * 0.06) * 0.35;
  const interior =
    (wUrban * hAirfield +
      wIndustrial * hRefinery +
      wForest * hCanyon +
      wMountain * hMesa) /
      weightSum +
    ripples * (1 - Math.min(1, wUrban + wIndustrial));

  // Natural sandstone canyon rim rising around r = 144..166 then dropping outside playable boundary
  const angle = Math.atan2(z, x);
  const rimNoise = 0.78 + 0.22 * Math.sin(angle * 7 + 0.8) + 0.14 * Math.cos(angle * 13);
  const rimRise = smoothstep(140, 158, dist) * (1 - smoothstep(166, 178, dist));
  const rimHeight = rimRise * 10.8 * rimNoise;

  const outerFalloff = 1 - smoothstep(166, 179, dist);
  return interior * outerFalloff + rimHeight;
}

function getFrostRidgeHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);

  const coastFalloff = 1.0 - smoothstep(142, 178, dist);
  if (coastFalloff <= 0.001) {
    return -3.2;
  }

  const drifts =
    Math.sin(x * 0.035) * Math.cos(z * 0.03) * 1.55 +
    Math.sin((x - z) * 0.07) * 0.6;

  const wUrban = smoothstep(14, -14, x) * smoothstep(14, -14, z);
  const wIndustrial = smoothstep(-14, 14, x) * smoothstep(14, -14, z);
  const wForest = smoothstep(14, -14, x) * smoothstep(-14, 14, z);
  const wMountain = smoothstep(-14, 14, x) * smoothstep(-14, 14, z);

  // NW Research Outpost: cleared flat snow terrace
  const hOutpost = 2.6;
  // NE Freight Yard: flat frozen dock pad
  const hYard = 2.4;
  // SW Pine Woods: rolling alpine snowdrifts
  const hWoods =
    4.1 +
    Math.sin(x * 0.052 + 1.1) * Math.cos(z * 0.048) * 2.35 +
    Math.cos(x * 0.1 + z * 0.09) * 0.7;

  // SE Glacier Peak: tall twin-shouldered ridge around (74, 74)
  const p1 = Math.max(0, 1 - Math.hypot(x - 74, z - 74) / 86);
  const p2 = Math.max(0, 1 - Math.hypot(x - 44, z - 98) / 54);
  const ridge =
    Math.pow(p1, 1.38) * 18.2 +
    Math.pow(p2, 1.5) * 7.8 +
    Math.sin(x * 0.095) * Math.cos(z * 0.09) * 1.1;
  const hGlacier = 3.4 + ridge;

  const weightSum = Math.max(0.0001, wUrban + wIndustrial + wForest + wMountain);
  const blended =
    (wUrban * hOutpost +
      wIndustrial * hYard +
      wForest * hWoods +
      wMountain * hGlacier) /
      weightSum +
    drifts * (1 - Math.min(1, wUrban + wIndustrial));

  return -3.2 + (blended + 3.2) * coastFalloff;
}

export function getTerrainHeight(
  x: number,
  z: number,
  mapId: MapId = 'emerald_island',
): number {
  if (mapId === 'arid_canyon') return getAridCanyonHeight(x, z);
  if (mapId === 'frost_ridge') return getFrostRidgeHeight(x, z);
  return getEmeraldIslandHeight(x, z);
}

export function getTerrainNormal(
  x: number,
  z: number,
  mapId: MapId = 'emerald_island',
): THREE.Vector3 {
  const eps = 0.6;
  const hL = getTerrainHeight(x - eps, z, mapId);
  const hR = getTerrainHeight(x + eps, z, mapId);
  const hD = getTerrainHeight(x, z - eps, mapId);
  const hU = getTerrainHeight(x, z + eps, mapId);
  return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
}

export class TerrainSystem {
  public readonly mesh: THREE.Mesh;
  public readonly waterMesh: THREE.Mesh;

  constructor(materials: MaterialLibrary, mapId: MapId = 'emerald_island') {
    const geo = new THREE.PlaneGeometry(
      ISLAND_SIZE,
      ISLAND_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cTemp = new THREE.Color();

    // Emerald Island palette
    const cSand = new THREE.Color(0xb6a98a);
    const cGrass = new THREE.Color(0x4e6442);
    const cForestFloor = new THREE.Color(0x3b4f34);
    const cUrban = new THREE.Color(0x6b7175);
    const cIndustrial = new THREE.Color(0x5d646b);
    const cRock = new THREE.Color(0x686e73);

    // Redstone Basin (Arid Canyon) palette
    const cDesertSand = new THREE.Color(0xba9567);
    const cSandstone = new THREE.Color(0x9b5f42);
    const cTerracotta = new THREE.Color(0x824933);
    const cDryWash = new THREE.Color(0xa6825c);
    const cDesertPad = new THREE.Color(0x7c7468);

    // Frostbite Ridge (Arctic) palette
    const cSnow = new THREE.Color(0xdbe3ea);
    const cFrost = new THREE.Color(0xb5c3ce);
    const cGlacier = new THREE.Color(0x83a4bc);
    const cBasalt = new THREE.Color(0x525c66);
    const cFrostYard = new THREE.Color(0x6c757e);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z, mapId);
      pos.setY(i, y);

      const dist = Math.hypot(x, z);
      const zone = getZoneAt(x, z, mapId);

      if (mapId === 'arid_canyon') {
        const rimBlend = smoothstep(5.5, 11.5, y);
        if (dist > 144) {
          cTemp.copy(cSandstone).lerp(cTerracotta, rimBlend);
        } else if (zone === 'urban') {
          cTemp.copy(cDesertPad).lerp(cDesertSand, 0.35);
        } else if (zone === 'industrial') {
          cTemp.copy(cDesertPad).lerp(cSandstone, 0.25);
        } else if (zone === 'forest') {
          const washBlend = smoothstep(2.0, 5.4, y);
          cTemp.copy(cDryWash).lerp(cSandstone, washBlend);
        } else {
          const mesaBlend = smoothstep(4.5, 13.0, y);
          cTemp.copy(cDesertSand).lerp(cTerracotta, mesaBlend);
        }
      } else if (mapId === 'frost_ridge') {
        if (y < 0.85 || dist > 152) {
          cTemp.copy(cBasalt).lerp(cFrost, 0.35);
        } else if (zone === 'urban') {
          cTemp.copy(cFrostYard).lerp(cSnow, 0.55);
        } else if (zone === 'industrial') {
          cTemp.copy(cFrostYard).lerp(cBasalt, 0.2);
        } else if (zone === 'forest') {
          const drift = 0.5 + 0.5 * Math.sin(x * 0.07 + z * 0.06);
          cTemp.copy(cFrost).lerp(cSnow, drift);
        } else {
          const iceBlend = smoothstep(7.5, 16.0, y);
          cTemp.copy(cSnow).lerp(cGlacier, iceBlend);
        }
      } else {
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

    // Surrounding ocean / arctic water OR endless desert expanse extending into horizon fog
    const mapSpec = MAP_CATALOG[mapId];
    const outerGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    outerGeo.rotateX(-Math.PI / 2);
    if (mapSpec.hasWater) {
      materials.water.color.setHex(mapSpec.waterColor);
      materials.water.opacity = mapSpec.waterOpacity;
      materials.water.transparent = mapSpec.waterOpacity < 1.0;
      this.waterMesh = new THREE.Mesh(outerGeo, materials.water);
      this.waterMesh.position.y = 0.0;
    } else {
      this.waterMesh = new THREE.Mesh(outerGeo, materials.desertSand);
      this.waterMesh.position.y = -0.05;
    }
    this.waterMesh.receiveShadow = true;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.waterMesh.geometry.dispose();
  }
}
