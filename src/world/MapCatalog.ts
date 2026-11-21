import { BiomeZone, MapId } from '../types/game';

export interface MapSpec {
  id: MapId;
  name: string;
  subtitle: string;
  climateLabel: string;
  skyColor: number;
  fogColor: number;
  fogDensityBase: number;
  sunColor: number;
  sunIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  hasWater: boolean;
  waterColor: number;
  waterOpacity: number;
  swatchHex: string;
  zoneNames: Record<BiomeZone, string>;
}

export const MAP_CATALOG: Record<MapId, MapSpec> = {
  emerald_island: {
    id: 'emerald_island',
    name: 'Emerald Island',
    subtitle: 'Coastal town, factory yard, pine woods, and radar peak',
    climateLabel: 'Coastal Overcast',
    skyColor: 0xb8c4ce,
    fogColor: 0xaeb9c2,
    fogDensityBase: 0.0052,
    sunColor: 0xf6f8fa,
    sunIntensity: 1.45,
    hemiSkyColor: 0xdce6ef,
    hemiGroundColor: 0x4b5545,
    hemiIntensity: 0.88,
    hasWater: true,
    waterColor: 0x3b5364,
    waterOpacity: 0.88,
    swatchHex: '#4E6442',
    zoneNames: {
      urban: 'Urban Zone',
      industrial: 'Industrial Zone',
      forest: 'Forest Zone',
      mountain: 'Mountain Zone',
    },
  },
  arid_canyon: {
    id: 'arid_canyon',
    name: 'Redstone Basin',
    subtitle: 'Desert airfield, oil refinery, dry canyon, and mesa ridge',
    climateLabel: 'Golden Desert Haze',
    skyColor: 0xd9c2a3,
    fogColor: 0xd0b796,
    fogDensityBase: 0.0048,
    sunColor: 0xfff0d6,
    sunIntensity: 1.62,
    hemiSkyColor: 0xf2dfc8,
    hemiGroundColor: 0x7b583a,
    hemiIntensity: 0.82,
    hasWater: false,
    waterColor: 0xb59164,
    waterOpacity: 1.0,
    swatchHex: '#A66A46',
    zoneNames: {
      urban: 'Airfield',
      industrial: 'Refinery',
      forest: 'Sandstone Canyon',
      mountain: 'Mesa Ridge',
    },
  },
  frost_ridge: {
    id: 'frost_ridge',
    name: 'Frostbite Ridge',
    subtitle: 'Arctic research outpost, freight depot, frozen pines, and glacier',
    climateLabel: 'Arctic Mist',
    skyColor: 0xc5d6e4,
    fogColor: 0xb8c9d8,
    fogDensityBase: 0.0055,
    sunColor: 0xf2f7ff,
    sunIntensity: 1.5,
    hemiSkyColor: 0xd8e8f8,
    hemiGroundColor: 0x5c6f7e,
    hemiIntensity: 0.9,
    hasWater: true,
    waterColor: 0x263a49,
    waterOpacity: 0.92,
    swatchHex: '#84A5BC',
    zoneNames: {
      urban: 'Research Outpost',
      industrial: 'Freight Yard',
      forest: 'Pine Woods',
      mountain: 'Glacier Peak',
    },
  },
};

export const MAP_LIST: MapSpec[] = [
  MAP_CATALOG.emerald_island,
  MAP_CATALOG.arid_canyon,
  MAP_CATALOG.frost_ridge,
];
