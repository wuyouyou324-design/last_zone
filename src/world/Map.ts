import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { EnvironmentSystem, ObstacleBounds } from './Environment';
import { MaterialLibrary } from './Materials';
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
  public readonly terrain: TerrainSystem;
  public readonly environment: EnvironmentSystem;
  public readonly minimapCanvas: HTMLCanvasElement;

  constructor(materials: MaterialLibrary, physics: PhysicsWorld) {
    // 1. Register terrain heightfield collider in Rapier
    physics.buildTerrainHeightfield(ISLAND_SIZE, TERRAIN_SEGMENTS, getTerrainHeight);

    // 2. Build Three.js terrain + coastal water
    this.terrain = new TerrainSystem(materials);
    this.root.add(this.terrain.mesh, this.terrain.waterMesh);

    // 3. Build 4-zone structures + instanced trees & boulders
    this.environment = new EnvironmentSystem(materials, physics);
    this.root.add(this.environment.group);

    // 4. Pre-render static 2D minimap biome texture once
    this.minimapCanvas = this.generateMinimapImage();
  }

  public getObstacles(): ObstacleBounds[] {
    return this.environment.obstacles;
  }

  public isPointWalkable(x: number, z: number, margin = 1.6): boolean {
    if (Math.hypot(x, z) > ISLAND_PLAYABLE_RADIUS - 18) return false;
    const h = getTerrainHeight(x, z);
    if (h < 1.1) return false;
    for (const obs of this.environment.obstacles) {
      if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + margin) {
        return false;
      }
    }
    return true;
  }

  public generateSpawnPoints(count: number): SpawnPoint[] {
    const points: SpawnPoint[] = [];
    // Spread combatants evenly around ring sectors across all 4 zones
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2 + 0.25;
      let chosen: SpawnPoint | null = null;
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = baseAngle + (attempt * 0.13);
        const radius = 58 + ((i * 23 + attempt * 11) % 68);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (this.isPointWalkable(x, z, 2.5)) {
          const tooClose = points.some((p) => Math.hypot(p.x - x, p.z - z) < 28);
          if (!tooClose) {
            chosen = { x, y: getTerrainHeight(x, z), z };
            break;
          }
        }
      }
      if (!chosen) {
        const fallbackAngle = baseAngle;
        const fx = Math.cos(fallbackAngle) * 52;
        const fz = Math.sin(fallbackAngle) * 52;
        chosen = { x: fx, y: getTerrainHeight(fx, fz), z: fz };
      }
      points.push(chosen);
    }
    return points;
  }

  public generateLootLocations(): SpawnPoint[] {
    const curated: Array<[number, number]> = [
      // Urban Zone
      [-42, -33], [-64, -56], [-86, -34], [-44, -79], [-88, -78], [-64, -90], [-28, -93],
      // Industrial Zone
      [52, -48], [64, -68], [92, -82], [80, -48], [48, -92], [104, -52], [35, -35],
      // Forest Zone
      [-48, 54], [-72, 42], [-88, 86], [-32, 82], [-64, 108], [-104, 52], [-42, 32],
      // Mountain Zone
      [76, 76], [56, 59], [94, 65], [64, 96], [42, 44], [106, 94], [82, 42],
    ];

    const results: SpawnPoint[] = [];
    for (const [x, z] of curated) {
      const y = getTerrainHeight(x, z);
      results.push({ x, y, z });
    }
    return results;
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
      const worldZ = ((py / size) - 0.5) * ISLAND_SIZE;
      for (let px = 0; px < size; px++) {
        const worldX = ((px / size) - 0.5) * ISLAND_SIZE;
        const h = getTerrainHeight(worldX, worldZ);
        const zone = getZoneAt(worldX, worldZ);
        const idx = (py * size + px) * 4;

        let r = 24;
        let g = 42;
        let b = 54;

        if (h > 0.05) {
          if (h < 1.1) {
            r = 128; g = 120; b = 98; // Coast sand
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
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    // Draw urban road grid + obstacle markers on minimap
    const toMap = (wx: number, wz: number): [number, number] => [
      ((wx / ISLAND_SIZE) + 0.5) * size,
      ((wz / ISLAND_SIZE) + 0.5) * size,
    ];

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

    ctx.fillStyle = 'rgba(200, 210, 220, 0.42)';
    for (const obs of this.environment.obstacles) {
      if (obs.radius < 2.2) continue;
      const [ox, oz] = toMap(obs.x, obs.z);
      const rad = Math.max(1.5, (obs.radius / ISLAND_SIZE) * size * 0.75);
      ctx.fillRect(ox - rad, oz - rad, rad * 2, rad * 2);
    }

    return canvas;
  }

  public dispose(): void {
    this.terrain.dispose();
    this.environment.dispose();
  }
}
