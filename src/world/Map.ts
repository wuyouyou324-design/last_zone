import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { BiomeZone, DoorPrompt, MapId } from '../types/game';
import { EnvironmentSystem, ObstacleBounds } from './Environment';
import { MaterialLibrary } from './Materials';
import { MultiStoryBuilding } from './MultiStoryBuilding';
import {
  getTerrainHeight,
  getZoneAt,
  ISLAND_PLAYABLE_RADIUS,
  ISLAND_SIZE,
  TERRAIN_SEGMENTS,
  TerrainSystem,
} from './Terrain';

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

export class IslandMap {
  public readonly root = new THREE.Group();
  public readonly mapId: MapId;
  public readonly terrain: TerrainSystem;
  public readonly environment: EnvironmentSystem;
  public readonly minimapCanvas: HTMLCanvasElement;

  constructor(
    materials: MaterialLibrary,
    physics: PhysicsWorld,
    mapId: MapId = 'emerald_island',
  ) {
    this.mapId = mapId;

    // 1. Register terrain heightfield collider in Rapier
    physics.buildTerrainHeightfield(ISLAND_SIZE, TERRAIN_SEGMENTS, (x, z) =>
      getTerrainHeight(x, z, mapId),
    );

    // 2. Build Three.js terrain + perimeter water/desert expanse
    this.terrain = new TerrainSystem(materials, mapId);
    this.root.add(this.terrain.mesh, this.terrain.waterMesh);

    // 3. Build 4-zone structures + instanced flora & rocks
    this.environment = new EnvironmentSystem(materials, physics, mapId);
    this.root.add(this.environment.group);

    // 4. Pre-render static 2D minimap biome texture once
    this.minimapCanvas = this.generateMinimapImage();
  }

  public getHeightAt(x: number, z: number): number {
    return getTerrainHeight(x, z, this.mapId);
  }

  public getZoneAt(x: number, z: number): BiomeZone {
    return getZoneAt(x, z, this.mapId);
  }

  public get multiStoryBuildings(): readonly MultiStoryBuilding[] {
    return this.environment.multiStoryBuildings;
  }

  public update(dt: number): void {
    this.environment.update(dt);
  }

  public resetDoors(): void {
    this.environment.resetInteractive();
  }

  public findNearestDoor(
    x: number,
    feetY: number,
    z: number,
    maxDist = 2.75,
  ): { prompt: DoorPrompt; distSq: number } | null {
    let best: { prompt: DoorPrompt; distSq: number } | null = null;
    for (const b of this.environment.multiStoryBuildings) {
      const candidate = b.findNearestDoor(x, feetY, z, maxDist);
      if (candidate && (!best || candidate.distSq < best.distSq)) {
        best = candidate;
      }
    }
    return best;
  }

  public toggleDoor(
    doorId: string,
  ): { toggled: boolean; isOpen: boolean; x: number; y: number; z: number } | null {
    for (const b of this.environment.multiStoryBuildings) {
      const res = b.toggleDoor(doorId);
      if (res) return res;
    }
    return null;
  }

  public getObstacles(): ObstacleBounds[] {
    return this.environment.obstacles;
  }

  public isPointWalkable(x: number, z: number, margin = 1.6): boolean {
    if (Math.hypot(x, z) > ISLAND_PLAYABLE_RADIUS - 18) return false;
    const h = this.getHeightAt(x, z);
    if (h < 1.1) return false;
    for (const obs of this.environment.obstacles) {
      if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + margin) {
        return false;
      }
    }
    for (const b of this.environment.multiStoryBuildings) {
      if (b.containsXZ(x, z, margin)) {
        return false;
      }
    }
    return true;
  }

  public generateSpawnPoints(count: number): SpawnPoint[] {
    const points: SpawnPoint[] = [];
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2 + 0.25;
      let chosen: SpawnPoint | null = null;
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = baseAngle + attempt * 0.13;
        const radius = 58 + ((i * 23 + attempt * 11) % 68);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (this.isPointWalkable(x, z, 2.5)) {
          const tooClose = points.some((p) => Math.hypot(p.x - x, p.z - z) < 28);
          if (!tooClose) {
            chosen = { x, y: this.getHeightAt(x, z), z };
            break;
          }
        }
      }
      if (!chosen) {
        const fallbackAngle = baseAngle;
        const fx = Math.cos(fallbackAngle) * 52;
        const fz = Math.sin(fallbackAngle) * 52;
        chosen = { x: fx, y: this.getHeightAt(fx, fz), z: fz };
      }
      points.push(chosen);
    }
    return points;
  }

  public generateLootLocations(): SpawnPoint[] {
    const curatedByMap: Record<MapId, Array<[number, number]>> = {
      emerald_island: [
        [-42, -33], [-64, -56], [-86, -34], [-44, -79], [-88, -78], [-64, -90], [-28, -93],
        [52, -48], [64, -68], [92, -82], [80, -48], [48, -92], [104, -52], [35, -35],
        [-48, 54], [-72, 42], [-88, 86], [-32, 82], [-64, 108], [-104, 52], [-42, 32],
        [76, 76], [56, 59], [94, 65], [64, 96], [42, 44], [106, 94], [82, 42],
      ],
      arid_canyon: [
        [-42, -42], [-76, -54], [-76, -86], [-102, -90], [-46, -94], [-60, -68], [-32, -58],
        [50, -48], [64, -68], [94, -84], [80, -48], [48, -92], [104, -52], [36, -36],
        [-46, 54], [-74, 48], [-88, 86], [-48, 84], [-68, 102], [-96, 58], [-38, 36],
        [76, 76], [56, 62], [94, 66], [62, 92], [44, 46], [102, 92], [82, 44],
      ],
      frost_ridge: [
        [-42, -42], [-64, -56], [-86, -34], [-44, -76], [-88, -78], [-64, -90], [-28, -93],
        [52, -48], [64, -68], [92, -82], [80, -48], [48, -92], [104, -52], [35, -35],
        [-48, 54], [-72, 42], [-88, 86], [-32, 82], [-64, 108], [-104, 52], [-42, 32],
        [74, 74], [56, 58], [94, 65], [64, 96], [42, 44], [104, 92], [82, 42],
      ],
    };

    const points = curatedByMap[this.mapId].map(([x, z]) => ({
      x,
      y: this.getHeightAt(x, z),
      z,
    }));
    const indoor = this.environment.getMultiStoryLootSpawns();
    for (const pt of indoor) {
      points.push(pt);
    }
    return points;
  }

  private generateMinimapImage(): HTMLCanvasElement {
    const size = 180;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let py = 0; py < size; py++) {
      const worldZ = (py / size - 0.5) * ISLAND_SIZE;
      for (let px = 0; px < size; px++) {
        const worldX = (px / size - 0.5) * ISLAND_SIZE;
        const h = this.getHeightAt(worldX, worldZ);
        const zone = this.getZoneAt(worldX, worldZ);
        const dist = Math.hypot(worldX, worldZ);
        const idx = (py * size + px) * 4;

        let r = 24;
        let g = 42;
        let b = 54;

        if (this.mapId === 'arid_canyon') {
          if (dist > 168) {
            r = 148; g = 114; b = 78;
          } else if (dist > 144) {
            r = 126; g = 74; b = 50; // Sandstone rim
          } else if (zone === 'urban') {
            r = 114; g = 104; b = 88;
          } else if (zone === 'industrial') {
            r = 104; g = 92; b = 78;
          } else if (zone === 'forest') {
            const shade = Math.min(35, Math.floor(h * 4));
            r = 118 + shade; g = 86 + Math.floor(shade * 0.6); b = 60 + Math.floor(shade * 0.4);
          } else {
            const shade = Math.min(45, Math.floor(h * 2.8));
            r = 122 + shade; g = 78 + Math.floor(shade * 0.65); b = 54 + Math.floor(shade * 0.45);
          }
        } else if (this.mapId === 'frost_ridge') {
          if (h > 0.05) {
            if (h < 1.1) {
              r = 86; g = 96; b = 108; // Rocky shore
            } else if (zone === 'urban') {
              r = 162; g = 174; b = 186;
            } else if (zone === 'industrial') {
              r = 110; g = 122; b = 134;
            } else if (zone === 'forest') {
              r = 132; g = 152; b = 164;
            } else {
              const shade = Math.min(45, Math.floor(h * 2.2));
              r = 150 + shade; g = 168 + shade; b = 186 + Math.min(40, shade);
            }
          } else {
            r = 22; g = 38; b = 52;
          }
        } else {
          if (h > 0.05) {
            if (h < 1.1) {
              r = 128; g = 120; b = 98;
            } else if (zone === 'urban') {
              r = 78; g = 84; b = 90;
            } else if (zone === 'industrial') {
              r = 68; g = 75; b = 82;
            } else if (zone === 'forest') {
              r = 46; g = 69; b = 46;
            } else {
              const shade = Math.min(45, Math.floor(h * 2.5));
              r = 68 + shade;
              g = 73 + shade;
              b = 76 + shade;
            }
          }
        }
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    const toMap = (wx: number, wz: number): [number, number] => [
      (wx / ISLAND_SIZE + 0.5) * size,
      (wz / ISLAND_SIZE + 0.5) * size,
    ];

    if (this.mapId === 'arid_canyon') {
      // Draw Airfield Runway & Taxiway on minimap
      ctx.strokeStyle = 'rgba(42, 40, 38, 0.9)';
      ctx.lineWidth = 6;
      const [rx1, rz1] = toMap(-76, -125);
      const [rx2, rz2] = toMap(-76, -12);
      ctx.beginPath();
      ctx.moveTo(rx1, rz1);
      ctx.lineTo(rx2, rz2);
      ctx.stroke();

      ctx.lineWidth = 3.5;
      const [tx1, tz1] = toMap(-76, -68);
      const [tx2, tz2] = toMap(-18, -68);
      ctx.beginPath();
      ctx.moveTo(tx1, tz1);
      ctx.lineTo(tx2, tz2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(32, 36, 40, 0.85)';
      ctx.lineWidth = 4;
      const [rx1, rz1] = toMap(-64, -125);
      const [rx2, rz2] = toMap(-64, -10);
      ctx.beginPath();
      ctx.moveTo(rx1, rz1);
      ctx.lineTo(rx2, rz2);
      ctx.stroke();

      const [hx1, hz1] = toMap(-125, -64);
      const [hx2, hz2] = toMap(-10, -64);
      ctx.beginPath();
      ctx.moveTo(hx1, hz1);
      ctx.lineTo(hx2, hz2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(200, 210, 220, 0.42)';
    for (const obs of this.environment.obstacles) {
      if (obs.radius < 2.2) continue;
      const [ox, oz] = toMap(obs.x, obs.z);
      const rad = Math.max(1.5, (obs.radius / ISLAND_SIZE) * size * 0.75);
      ctx.fillRect(ox - rad, oz - rad, rad * 2, rad * 2);
    }

    for (const fp of this.environment.buildingFootprints) {
      const [bx, bz] = toMap(fp.x, fp.z);
      const bw = Math.max(4, (fp.w / ISLAND_SIZE) * size);
      const bd = Math.max(4, (fp.d / ISLAND_SIZE) * size);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.fillRect(bx - bw * 0.5, bz - bd * 0.5, bw, bd);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - bw * 0.5, bz - bd * 0.5, bw, bd);
    }

    return canvas;
  }

  public dispose(): void {
    this.terrain.dispose();
    this.environment.dispose();
  }
}
