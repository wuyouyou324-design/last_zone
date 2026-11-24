import { MapId, VehicleType } from '../types/game';
import { SurfaceType } from '../world/Terrain';

export interface VehicleWheelSpec {
  offsetX: number;
  offsetZ: number;
  radius: number;
  width: number;
  steerable: boolean;
}

export interface VehicleSpec {
  type: VehicleType;
  name: string;
  massKg: number;
  width: number;
  height: number;
  length: number;
  wheelbase: number;
  trackWidth: number;
  groundClearance: number;
  maxSpeedForward: number; // m/s on road
  maxSpeedReverse: number; // m/s
  acceleration: number; // m/s^2
  braking: number; // m/s^2
  handbrakeDecel: number; // m/s^2
  drag: number;
  steerAngleRad: number; // max wheel turn angle
  steerRate: number; // rad/s steering speed
  lateralGrip: number; // higher = less drift
  maxClimbSlopeCos: number; // cos(max slope angle)
  suspensionStiffness: number;
  maxRollRad: number;
  maxPitchRad: number;
  maxHealth: number;
  maxFuel: number;
  fuelBurnPerSec: number;
  defaultCamDist: number;
  camHeight: number;
  surfaceSpeedMult: Record<SurfaceType, number>;
  surfaceGripMult: Record<SurfaceType, number>;
  wheels: VehicleWheelSpec[];
  primaryColorHex: number;
  accentColorHex: number;
}

export const VEHICLE_CATALOG: Record<VehicleType, VehicleSpec> = {
  sedan: {
    type: 'sedan',
    name: 'Valkyrie Sedan',
    massKg: 1380,
    width: 1.9,
    height: 1.46,
    length: 4.5,
    wheelbase: 2.72,
    trackWidth: 1.62,
    groundClearance: 0.24,
    maxSpeedForward: 28.0, // ~101 km/h
    maxSpeedReverse: 9.5,
    acceleration: 14.5,
    braking: 24.0,
    handbrakeDecel: 18.0,
    drag: 0.9,
    steerAngleRad: 0.52,
    steerRate: 4.2,
    lateralGrip: 8.8,
    maxClimbSlopeCos: 0.86, // ~30 deg
    suspensionStiffness: 18,
    maxRollRad: 0.055,
    maxPitchRad: 0.048,
    maxHealth: 340,
    maxFuel: 100,
    fuelBurnPerSec: 0.85,
    defaultCamDist: 6.2,
    camHeight: 2.15,
    surfaceSpeedMult: {
      road: 1.0,
      offroad: 0.62,
      sand: 0.56,
      snow: 0.58,
      shallow_water: 0.34,
    },
    surfaceGripMult: {
      road: 1.0,
      offroad: 0.68,
      sand: 0.6,
      snow: 0.54,
      shallow_water: 0.45,
    },
    wheels: [
      { offsetX: -0.82, offsetZ: -1.36, radius: 0.34, width: 0.24, steerable: true },
      { offsetX: 0.82, offsetZ: -1.36, radius: 0.34, width: 0.24, steerable: true },
      { offsetX: -0.82, offsetZ: 1.36, radius: 0.34, width: 0.24, steerable: false },
      { offsetX: 0.82, offsetZ: 1.36, radius: 0.34, width: 0.24, steerable: false },
    ],
    primaryColorHex: 0x3b536b,
    accentColorHex: 0x1e262e,
  },
  suv: {
    type: 'suv',
    name: 'Nomad 4x4 SUV',
    massKg: 2050,
    width: 2.08,
    height: 1.84,
    length: 4.68,
    wheelbase: 2.86,
    trackWidth: 1.76,
    groundClearance: 0.36,
    maxSpeedForward: 23.0, // ~83 km/h
    maxSpeedReverse: 8.8,
    acceleration: 13.4,
    braking: 22.0,
    handbrakeDecel: 20.0,
    drag: 1.05,
    steerAngleRad: 0.55,
    steerRate: 3.9,
    lateralGrip: 9.2,
    maxClimbSlopeCos: 0.64, // ~50 deg off-road climber
    suspensionStiffness: 13,
    maxRollRad: 0.082,
    maxPitchRad: 0.065,
    maxHealth: 480,
    maxFuel: 100,
    fuelBurnPerSec: 1.05,
    defaultCamDist: 6.7,
    camHeight: 2.45,
    surfaceSpeedMult: {
      road: 1.0,
      offroad: 0.9,
      sand: 0.86,
      snow: 0.86,
      shallow_water: 0.56,
    },
    surfaceGripMult: {
      road: 1.0,
      offroad: 0.92,
      sand: 0.88,
      snow: 0.84,
      shallow_water: 0.68,
    },
    wheels: [
      { offsetX: -0.89, offsetZ: -1.43, radius: 0.42, width: 0.28, steerable: true },
      { offsetX: 0.89, offsetZ: -1.43, radius: 0.42, width: 0.28, steerable: true },
      { offsetX: -0.89, offsetZ: 1.43, radius: 0.42, width: 0.28, steerable: false },
      { offsetX: 0.89, offsetZ: 1.43, radius: 0.42, width: 0.28, steerable: false },
    ],
    primaryColorHex: 0x4b5d44,
    accentColorHex: 0x222624,
  },
  pickup: {
    type: 'pickup',
    name: 'Ranger Pickup',
    massKg: 2250,
    width: 2.1,
    height: 1.86,
    length: 5.1,
    wheelbase: 3.16,
    trackWidth: 1.78,
    groundClearance: 0.34,
    maxSpeedForward: 24.5, // ~88 km/h
    maxSpeedReverse: 8.6,
    acceleration: 12.6,
    braking: 20.5,
    handbrakeDecel: 18.5,
    drag: 1.0,
    steerAngleRad: 0.48,
    steerRate: 3.5,
    lateralGrip: 8.2,
    maxClimbSlopeCos: 0.72, // ~44 deg
    suspensionStiffness: 15,
    maxRollRad: 0.072,
    maxPitchRad: 0.058,
    maxHealth: 450,
    maxFuel: 100,
    fuelBurnPerSec: 1.0,
    defaultCamDist: 7.1,
    camHeight: 2.5,
    surfaceSpeedMult: {
      road: 1.0,
      offroad: 0.81,
      sand: 0.78,
      snow: 0.77,
      shallow_water: 0.48,
    },
    surfaceGripMult: {
      road: 1.0,
      offroad: 0.84,
      sand: 0.79,
      snow: 0.74,
      shallow_water: 0.6,
    },
    wheels: [
      { offsetX: -0.9, offsetZ: -1.58, radius: 0.41, width: 0.27, steerable: true },
      { offsetX: 0.9, offsetZ: -1.58, radius: 0.41, width: 0.27, steerable: true },
      { offsetX: -0.9, offsetZ: 1.58, radius: 0.41, width: 0.27, steerable: false },
      { offsetX: 0.9, offsetZ: 1.58, radius: 0.41, width: 0.27, steerable: false },
    ],
    primaryColorHex: 0x8f4d31,
    accentColorHex: 0x26292d,
  },
  truck: {
    type: 'truck',
    name: 'Titan 6x6 Transport',
    massKg: 4800,
    width: 2.46,
    height: 2.86,
    length: 6.7,
    wheelbase: 4.1,
    trackWidth: 2.06,
    groundClearance: 0.4,
    maxSpeedForward: 17.5, // ~63 km/h
    maxSpeedReverse: 6.5,
    acceleration: 8.2,
    braking: 15.0,
    handbrakeDecel: 14.5,
    drag: 1.15,
    steerAngleRad: 0.4,
    steerRate: 2.5,
    lateralGrip: 7.6,
    maxClimbSlopeCos: 0.76, // ~40 deg
    suspensionStiffness: 11,
    maxRollRad: 0.06,
    maxPitchRad: 0.045,
    maxHealth: 760,
    maxFuel: 120,
    fuelBurnPerSec: 1.25,
    defaultCamDist: 8.8,
    camHeight: 3.15,
    surfaceSpeedMult: {
      road: 1.0,
      offroad: 0.74,
      sand: 0.7,
      snow: 0.72,
      shallow_water: 0.45,
    },
    surfaceGripMult: {
      road: 1.0,
      offroad: 0.8,
      sand: 0.75,
      snow: 0.74,
      shallow_water: 0.58,
    },
    wheels: [
      { offsetX: -1.04, offsetZ: -2.05, radius: 0.48, width: 0.32, steerable: true },
      { offsetX: 1.04, offsetZ: -2.05, radius: 0.48, width: 0.32, steerable: true },
      { offsetX: -1.04, offsetZ: 1.12, radius: 0.48, width: 0.32, steerable: false },
      { offsetX: 1.04, offsetZ: 1.12, radius: 0.48, width: 0.32, steerable: false },
      { offsetX: -1.04, offsetZ: 2.28, radius: 0.48, width: 0.32, steerable: false },
      { offsetX: 1.04, offsetZ: 2.28, radius: 0.48, width: 0.32, steerable: false },
    ],
    primaryColorHex: 0x5c6352,
    accentColorHex: 0x2e3129,
  },
};

export interface VehicleSpawnPoint {
  type: VehicleType;
  x: number;
  z: number;
  yaw: number;
}

export function getVehicleSpawnsForMap(mapId: MapId): VehicleSpawnPoint[] {
  if (mapId === 'arid_canyon') {
    return [
      { type: 'suv', x: 40, z: 22, yaw: 2.35 },
      { type: 'sedan', x: -76, z: -32, yaw: 0.0 },
      { type: 'pickup', x: -40, z: -68, yaw: Math.PI * 0.5 },
      { type: 'truck', x: 64, z: -56, yaw: -0.3 },
      { type: 'sedan', x: -76, z: -102, yaw: Math.PI },
      { type: 'pickup', x: -28, z: 40, yaw: -2.2 },
    ];
  }
  if (mapId === 'frost_ridge') {
    return [
      { type: 'suv', x: 40, z: 22, yaw: 2.35 },
      { type: 'sedan', x: -64, z: -32, yaw: 0.0 },
      { type: 'pickup', x: -82, z: -64, yaw: -Math.PI * 0.5 },
      { type: 'truck', x: 66, z: -58, yaw: 0.25 },
      { type: 'suv', x: -32, z: 36, yaw: -2.4 },
      { type: 'pickup', x: -38, z: -64, yaw: Math.PI * 0.5 },
    ];
  }
  // emerald_island
  return [
    { type: 'suv', x: 40, z: 22, yaw: 2.35 },
    { type: 'sedan', x: -64, z: -32, yaw: 0.0 },
    { type: 'sedan', x: -80, z: -64, yaw: -Math.PI * 0.5 },
    { type: 'pickup', x: 42, z: -66, yaw: 0.35 },
    { type: 'truck', x: 74, z: -58, yaw: -0.2 },
    { type: 'suv', x: -32, z: 36, yaw: -2.4 },
  ];
}
