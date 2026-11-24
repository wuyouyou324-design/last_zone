import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { MapId } from '../types/game';
import { MaterialLibrary } from './Materials';
import { MultiStoryBuilding } from './MultiStoryBuilding';
import { getTerrainHeight } from './Terrain';

export interface ObstacleBounds {
  x: number;
  z: number;
  radius: number;
}

export interface BuildingFootprint {
  x: number;
  z: number;
  w: number;
  d: number;
  rotY: number;
}

export class EnvironmentSystem {
  public readonly group = new THREE.Group();
  public readonly obstacles: ObstacleBounds[] = [];
  public readonly multiStoryBuildings: MultiStoryBuilding[] = [];
  public readonly buildingFootprints: BuildingFootprint[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private treeTrunks!: THREE.InstancedMesh;
  private treeCanopyLower!: THREE.InstancedMesh;
  private treeCanopyUpper!: THREE.InstancedMesh;
  private rocksMesh!: THREE.InstancedMesh;
  private extraRocksMesh: THREE.InstancedMesh | null = null;
  private treeCountMax = 0;
  private rockCountMax = 0;
  private extraRockCountMax = 0;

  constructor(
    private materials: MaterialLibrary,
    private physics: PhysicsWorld,
    private mapId: MapId = 'emerald_island',
  ) {
    if (this.mapId === 'arid_canyon') {
      this.buildAridAirfieldZone();
      this.buildAridRefineryZone();
      this.buildAridMesaZone();
      this.buildAridCanyonStructures();
      this.buildAridInstancedProps();
    } else if (this.mapId === 'frost_ridge') {
      this.buildFrostOutpostZone();
      this.buildFrostFreightZone();
      this.buildFrostGlacierZone();
      this.buildFrostWoodsStructures();
      this.buildFrostInstancedProps();
    } else {
      this.buildUrbanZone();
      this.buildIndustrialZone();
      this.buildMountainZone();
      this.buildForestStructures();
      this.buildInstancedVegetationAndRocks();
    }
  }

  private heightAt(x: number, z: number): number {
    return getTerrainHeight(x, z, this.mapId);
  }

  private regGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private addBoxPart(
    parent: THREE.Group,
    w: number,
    h: number,
    d: number,
    lx: number,
    ly: number,
    lz: number,
    mat: THREE.Material,
    castShadow = true,
  ): THREE.Mesh {
    const geo = this.regGeo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(lx, ly, lz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private addCylinderPart(
    parent: THREE.Group,
    rt: number,
    rb: number,
    h: number,
    seg: number,
    lx: number,
    ly: number,
    lz: number,
    mat: THREE.Material,
    castShadow = true,
  ): THREE.Mesh {
    const geo = this.regGeo(new THREE.CylinderGeometry(rt, rb, h, seg));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(lx, ly, lz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // ===========================================================================
  // MAP 1: EMERALD ISLAND (Original 4-Biome Island)
  // ===========================================================================

  private buildUrbanZone(): void {
    const roadNS = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(11, 0.06, 118)),
      this.materials.asphalt,
    );
    roadNS.position.set(-64, 2.02, -68);
    roadNS.receiveShadow = true;
    this.group.add(roadNS);

    const roadEW = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(118, 0.06, 11)),
      this.materials.asphalt,
    );
    roadEW.position.set(-68, 2.025, -64);
    roadEW.receiveShadow = true;
    this.group.add(roadEW);

    // Primary enterable Two-Story Tactical Compound at (-42, -42)
    const hqX = -42;
    const hqZ = -42;
    const hqY = this.heightAt(hqX, hqZ);
    const hqBuilding = new MultiStoryBuilding(
      'urban-hq-2f',
      hqX,
      hqY,
      hqZ,
      0,
      this.materials,
      this.physics,
    );
    this.group.add(hqBuilding.group);
    this.multiStoryBuildings.push(hqBuilding);
    this.buildingFootprints.push({
      x: hqX,
      z: hqZ,
      w: hqBuilding.width,
      d: hqBuilding.depth,
      rotY: 0,
    });

    const buildings: Array<{
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      rotY: number;
      brick: boolean;
    }> = [
      { x: -86, z: -44, w: 16, d: 12, h: 10.5, rotY: Math.PI / 2, brick: false },
      { x: -44, z: -88, w: 15, d: 13, h: 7.5, rotY: Math.PI, brick: false },
      { x: -88, z: -88, w: 14, d: 14, h: 12.0, rotY: 0, brick: true },
      { x: -28, z: -102, w: 11, d: 10, h: 6.2, rotY: -Math.PI / 2, brick: true },
      { x: -108, z: -64, w: 12, d: 15, h: 8.0, rotY: 0, brick: false },
    ];

    buildings.forEach((b) => {
      const groundY = this.heightAt(b.x, b.z);
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, groundY, b.z);
      bGroup.rotation.y = b.rotY;

      const wallMat = b.brick ? this.materials.brickWarm : this.materials.concreteWall;
      const trimMat = this.materials.concreteDark;

      this.addBoxPart(bGroup, b.w + 0.8, 0.4, b.d + 0.8, 0, 0.2, 0, trimMat, false);

      const wallThick = 0.65;
      const doorWidth = 3.4;
      const frontSideW = (b.w - doorWidth) * 0.5;

      this.addBoxPart(bGroup, b.w, b.h, wallThick, 0, b.h * 0.5 + 0.4, -b.d * 0.5 + wallThick * 0.5, wallMat);
      this.addBoxPart(bGroup, wallThick, b.h, b.d, -b.w * 0.5 + wallThick * 0.5, b.h * 0.5 + 0.4, 0, wallMat);
      this.addBoxPart(bGroup, wallThick, b.h, b.d, b.w * 0.5 - wallThick * 0.5, b.h * 0.5 + 0.4, 0, wallMat);
      this.addBoxPart(
        bGroup,
        frontSideW,
        b.h,
        wallThick,
        -b.w * 0.5 + frontSideW * 0.5,
        b.h * 0.5 + 0.4,
        b.d * 0.5 - wallThick * 0.5,
        wallMat,
      );
      this.addBoxPart(
        bGroup,
        frontSideW,
        b.h,
        wallThick,
        b.w * 0.5 - frontSideW * 0.5,
        b.h * 0.5 + 0.4,
        b.d * 0.5 - wallThick * 0.5,
        wallMat,
      );
      this.addBoxPart(
        bGroup,
        doorWidth,
        b.h - 2.8,
        wallThick,
        0,
        2.8 + (b.h - 2.8) * 0.5 + 0.4,
        b.d * 0.5 - wallThick * 0.5,
        wallMat,
      );

      this.addBoxPart(bGroup, b.w + 0.6, 0.5, b.d + 0.6, 0, b.h + 0.65, 0, trimMat);
      this.addBoxPart(bGroup, 2.2, 1.1, 1.8, -b.w * 0.22, b.h + 1.45, -b.d * 0.15, this.materials.corrugatedSteel);
      this.addBoxPart(bGroup, 0.4, 2.0, 0.4, b.w * 0.28, b.h + 1.9, b.d * 0.2, this.materials.gunMetal);
      this.addBoxPart(bGroup, b.w + 0.15, 0.28, 0.2, 0, b.h * 0.58, b.d * 0.5 + 0.05, trimMat, false);

      this.group.add(bGroup);

      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, 0, -b.d * 0.5 + wallThick * 0.5, b.w * 0.5, b.h * 0.5, wallThick * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, -b.w * 0.5 + wallThick * 0.5, 0, wallThick * 0.5, b.h * 0.5, b.d * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, b.w * 0.5 - wallThick * 0.5, 0, wallThick * 0.5, b.h * 0.5, b.d * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, -b.w * 0.5 + frontSideW * 0.5, b.d * 0.5 - wallThick * 0.5, frontSideW * 0.5, b.h * 0.5, wallThick * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, b.w * 0.5 - frontSideW * 0.5, b.d * 0.5 - wallThick * 0.5, frontSideW * 0.5, b.h * 0.5, wallThick * 0.5, b.rotY);

      this.obstacles.push({ x: b.x, z: b.z, radius: Math.max(b.w, b.d) * 0.6 });
    });

    const barriers: Array<[number, number, number]> = [
      [-57, -48, 0],
      [-71, -55, 0.25],
      [-56, -78, -0.15],
      [-80, -70, Math.PI / 2],
      [-48, -58, Math.PI / 2],
      [-94, -58, Math.PI / 2],
    ];
    barriers.forEach(([bx, bz, rot]) => {
      const y = this.heightAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y, bz);
      grp.rotation.y = rot;
      this.addBoxPart(grp, 3.2, 0.95, 0.7, 0, 0.48, 0, this.materials.concreteDark);
      this.addBoxPart(grp, 3.3, 0.16, 0.76, 0, 0.9, 0, this.materials.hazardTrim, false);
      this.group.add(grp);
      this.physics.addStaticBox(bx, y + 0.5, bz, 1.65, 0.5, 0.4, rot);
      this.obstacles.push({ x: bx, z: bz, radius: 1.9 });
    });
  }

  private buildIndustrialZone(): void {
    const yardPad = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(92, 0.08, 92)),
      this.materials.concreteDark,
    );
    yardPad.position.set(68, 2.22, -68);
    yardPad.receiveShadow = true;
    this.group.add(yardPad);

    const warehouses = [
      { x: 52, z: -48, w: 18, d: 24, h: 8.2, rotY: 0 },
      { x: 92, z: -82, w: 16, d: 22, h: 7.5, rotY: Math.PI / 2 },
    ];
    warehouses.forEach((w) => {
      const y = this.heightAt(w.x, w.z);
      const grp = new THREE.Group();
      grp.position.set(w.x, y, w.z);
      grp.rotation.y = w.rotY;

      this.addBoxPart(grp, w.w + 0.8, 0.35, w.d + 0.8, 0, 0.175, 0, this.materials.concreteDark, false);
      this.addBoxPart(grp, 0.55, w.h, w.d, -w.w * 0.5 + 0.28, w.h * 0.5 + 0.35, 0, this.materials.corrugatedSteel);
      this.addBoxPart(grp, 0.55, w.h, w.d, w.w * 0.5 - 0.28, w.h * 0.5 + 0.35, 0, this.materials.corrugatedSteel);
      this.addBoxPart(grp, w.w + 0.8, 0.45, w.d + 0.8, 0, w.h + 0.55, 0, this.materials.industrialAccent);
      this.addBoxPart(grp, w.w * 0.65, 0.7, w.d + 0.4, 0, w.h + 1.05, 0, this.materials.corrugatedSteel);
      this.addBoxPart(grp, 0.7, w.h, 0.7, -w.w * 0.5 + 0.3, w.h * 0.5 + 0.35, w.d * 0.5 - 0.35, this.materials.hazardTrim);
      this.addBoxPart(grp, 0.7, w.h, 0.7, w.w * 0.5 - 0.3, w.h * 0.5 + 0.35, w.d * 0.5 - 0.35, this.materials.hazardTrim);
      this.group.add(grp);

      this.registerRotatedBox(w.x, y + w.h * 0.5 + 0.35, w.z, -w.w * 0.5 + 0.28, 0, 0.35, w.h * 0.5, w.d * 0.5, w.rotY);
      this.registerRotatedBox(w.x, y + w.h * 0.5 + 0.35, w.z, w.w * 0.5 - 0.28, 0, 0.35, w.h * 0.5, w.d * 0.5, w.rotY);
      this.obstacles.push({ x: w.x, z: w.z, radius: Math.max(w.w, w.d) * 0.55 });
    });

    const silos: Array<[number, number, number, number]> = [
      [88, -42, 4.2, 9.5],
      [100, -42, 4.2, 9.5],
      [88, -55, 3.6, 8.0],
      [100, -55, 3.6, 8.0],
    ];
    silos.forEach(([sx, sz, r, h]) => {
      const y = this.heightAt(sx, sz);
      const grp = new THREE.Group();
      grp.position.set(sx, y, sz);

      this.addCylinderPart(grp, r + 0.35, r + 0.35, 0.6, 16, 0, 0.3, 0, this.materials.concreteDark, false);
      this.addCylinderPart(grp, r, r, h, 16, 0, h * 0.5 + 0.6, 0, this.materials.corrugatedSteel);
      this.addCylinderPart(grp, r + 0.14, r + 0.14, 0.55, 16, 0, h * 0.78, 0, this.materials.hazardTrim);

      const cap = new THREE.Mesh(
        this.regGeo(new THREE.ConeGeometry(r * 0.98, 1.4, 16)),
        this.materials.industrialAccent,
      );
      cap.position.y = h + 1.3;
      cap.castShadow = true;
      grp.add(cap);

      this.group.add(grp);
      this.physics.addStaticCylinder(sx, y + h * 0.5 + 0.6, sz, h * 0.5 + 0.6, r);
      this.obstacles.push({ x: sx, z: sz, radius: r + 0.5 });
    });

    const pipeY = this.heightAt(94, -42) + 7.5;
    const pipe = new THREE.Mesh(
      this.regGeo(new THREE.CylinderGeometry(0.45, 0.45, 13, 10)),
      this.materials.industrialAccent,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(94, pipeY, -42);
    pipe.castShadow = true;
    this.group.add(pipe);

    const containers = [
      { x: 46, z: -84, rot: 0.1, mat: this.materials.containerOlive },
      { x: 56, z: -90, rot: -0.2, mat: this.materials.containerRust },
      { x: 64, z: -76, rot: Math.PI / 2, mat: this.materials.containerSlate },
      { x: 44, z: -96, rot: 0, mat: this.materials.containerSlate },
      { x: 75, z: -98, rot: 0.35, mat: this.materials.containerOlive },
      { x: 108, z: -66, rot: Math.PI / 2, mat: this.materials.containerRust },
    ];
    containers.forEach((c) => {
      const y = this.heightAt(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rot;
      this.addBoxPart(grp, 6.2, 2.7, 2.5, 0, 1.35, 0, c.mat);
      this.addBoxPart(grp, 6.35, 0.2, 2.62, 0, 2.72, 0, this.materials.industrialAccent);
      this.addBoxPart(grp, 0.22, 2.75, 2.6, -3.02, 1.38, 0, this.materials.gunMetal);
      this.addBoxPart(grp, 0.22, 2.75, 2.6, 3.02, 1.38, 0, this.materials.gunMetal);
      this.group.add(grp);

      this.physics.addStaticBox(c.x, y + 1.38, c.z, 3.12, 1.38, 1.28, c.rot);
      this.obstacles.push({ x: c.x, z: c.z, radius: 3.4 });
    });
  }

  private buildMountainZone(): void {
    const ox = 76;
    const oz = 76;
    const oy = this.heightAt(ox, oz);

    const tower = new THREE.Group();
    tower.position.set(ox, oy, oz);

    this.addBoxPart(tower, 7.6, 0.6, 7.6, 0, 0.2, 0, this.materials.concreteDark, false);
    const legOffsets = [-2.6, 2.6];
    legOffsets.forEach((lx) => {
      legOffsets.forEach((lz) => {
        this.addBoxPart(tower, 0.45, 5.4, 0.45, lx, 2.7, lz, this.materials.industrialAccent);
        this.physics.addStaticBox(ox + lx, oy + 2.7, oz + lz, 0.28, 2.7, 0.28);
      });
    });
    this.addBoxPart(tower, 6.6, 0.35, 6.6, 0, 5.4, 0, this.materials.woodPlank);
    this.addBoxPart(tower, 6.6, 0.9, 0.2, 0, 6.0, 3.2, this.materials.gunMetal);
    this.addBoxPart(tower, 6.6, 0.9, 0.2, 0, 6.0, -3.2, this.materials.gunMetal);
    this.addBoxPart(tower, 0.2, 0.9, 6.6, -3.2, 6.0, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 0.2, 0.9, 6.6, 3.2, 6.0, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 5.2, 0.3, 5.2, 0, 8.2, 0, this.materials.corrugatedSteel);
    this.addBoxPart(tower, 0.35, 2.8, 0.35, 0, 9.6, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 2.2, 1.1, 0.3, 0, 10.7, 0, this.materials.hazardTrim);

    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const sx = -3.6 - (1 - t) * 5.2;
      const sy = t * 5.2;
      this.addBoxPart(tower, 0.75, 0.28, 2.2, sx, sy, 0, this.materials.woodPlank);
      this.physics.addStaticBox(ox + sx, oy + sy - 0.1, oz, 0.45, 0.25, 1.1);
    }

    this.group.add(tower);
    this.obstacles.push({ x: ox, z: oz, radius: 5.0 });

    const bunkers: Array<[number, number, number]> = [
      [56, 56, 0.7],
      [96, 62, -0.5],
      [62, 98, 0.2],
    ];
    bunkers.forEach(([bx, bz, rot]) => {
      const y = this.heightAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y, bz);
      grp.rotation.y = rot;
      this.addBoxPart(grp, 4.4, 1.25, 0.8, 0, 0.6, 0, this.materials.rock);
      this.addBoxPart(grp, 4.6, 0.22, 0.95, 0, 1.28, 0, this.materials.concreteDark);
      this.group.add(grp);
      this.physics.addStaticBox(bx, y + 0.65, bz, 2.3, 0.7, 0.5, rot);
      this.obstacles.push({ x: bx, z: bz, radius: 2.4 });
    });
  }

  private buildForestStructures(): void {
    const cabins = [
      { x: -48, z: 54, rotY: 0.4 },
      { x: -88, z: 86, rotY: -0.6 },
    ];
    cabins.forEach((c) => {
      const y = this.heightAt(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rotY;

      const w = 8.4;
      const d = 7.4;
      const h = 3.6;

      this.addBoxPart(grp, w + 0.6, 0.45, d + 1.8, 0, 0.22, 0.5, this.materials.concreteDark, false);
      this.addBoxPart(grp, w, h, 0.4, 0, h * 0.5 + 0.4, -d * 0.5 + 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, 0.4, h, d, -w * 0.5 + 0.2, h * 0.5 + 0.4, 0, this.materials.woodPlank);
      this.addBoxPart(grp, 0.4, h, d, w * 0.5 - 0.2, h * 0.5 + 0.4, 0, this.materials.woodPlank);
      this.addBoxPart(grp, 2.7, h, 0.4, -w * 0.5 + 1.35, h * 0.5 + 0.4, d * 0.5 - 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, 2.7, h, 0.4, w * 0.5 - 1.35, h * 0.5 + 0.4, d * 0.5 - 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, w + 1.1, 0.35, d + 2.1, 0, h + 0.55, 0.5, this.materials.concreteDark);
      this.addBoxPart(grp, w * 0.68, 0.9, d + 1.5, 0, h + 1.15, 0.5, this.materials.woodPlank);
      this.addBoxPart(grp, 0.25, h, 0.25, -w * 0.42, h * 0.5 + 0.4, d * 0.5 + 1.1, this.materials.treeBark);
      this.addBoxPart(grp, 0.25, h, 0.25, w * 0.42, h * 0.5 + 0.4, d * 0.5 + 1.1, this.materials.treeBark);

      this.group.add(grp);

      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, 0, -d * 0.5 + 0.2, w * 0.5, h * 0.5, 0.25, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, -w * 0.5 + 0.2, 0, 0.25, h * 0.5, d * 0.5, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, w * 0.5 - 0.2, 0, 0.25, h * 0.5, d * 0.5, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, -w * 0.5 + 1.35, d * 0.5 - 0.2, 1.35, h * 0.5, 0.25, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, w * 0.5 - 1.35, d * 0.5 - 0.2, 1.35, h * 0.5, 0.25, c.rotY);

      this.obstacles.push({ x: c.x, z: c.z, radius: 5.5 });
    });
  }

  private buildInstancedVegetationAndRocks(): void {
    let seed = 4219;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const treePositions: Array<{ x: number; y: number; z: number; s: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 240 && treePositions.length < 130; i++) {
      const inForest = i < 165;
      const x = inForest ? -14 - rand() * 124 : (rand() - 0.5) * 260;
      const z = inForest ? 14 + rand() * 124 : (rand() - 0.5) * 260;
      const dist = Math.hypot(x, z);
      if (dist > 142) continue;
      if (x < -12 && z < -12) continue;
      if (x > 12 && z < -12) continue;

      const y = this.heightAt(x, z);
      if (y < 1.2 || y > 14.5) continue;

      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const scale = 0.85 + rand() * 0.34;
      const tint = new THREE.Color().setHSL(0.28 + (rand() - 0.5) * 0.05, 0.32 + rand() * 0.1, 0.26 + rand() * 0.08);
      treePositions.push({ x, y, z, s: scale, tint });
      this.obstacles.push({ x, z, radius: 0.75 * scale });
    }

    this.treeCountMax = treePositions.length;
    const trunkGeo = this.regGeo(new THREE.CylinderGeometry(0.24, 0.42, 3.2, 6));
    trunkGeo.translate(0, 1.6, 0);
    const canopyLowGeo = this.regGeo(new THREE.ConeGeometry(2.3, 4.2, 7));
    canopyLowGeo.translate(0, 4.3, 0);
    const canopyHighGeo = this.regGeo(new THREE.ConeGeometry(1.65, 3.4, 7));
    canopyHighGeo.translate(0, 6.4, 0);

    this.treeTrunks = new THREE.InstancedMesh(trunkGeo, this.materials.treeBark, this.treeCountMax);
    this.treeCanopyLower = new THREE.InstancedMesh(canopyLowGeo, this.materials.treeFoliage, this.treeCountMax);
    this.treeCanopyUpper = new THREE.InstancedMesh(canopyHighGeo, this.materials.treeFoliage, this.treeCountMax);

    this.treeTrunks.castShadow = true;
    this.treeTrunks.receiveShadow = true;
    this.treeCanopyLower.castShadow = true;
    this.treeCanopyLower.receiveShadow = true;
    this.treeCanopyUpper.castShadow = true;
    this.treeCanopyUpper.receiveShadow = true;

    const dummy = new THREE.Object3D();
    treePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y - 0.1, tp.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(tp.s, tp.s, tp.s);
      dummy.updateMatrix();
      this.treeTrunks.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyLower.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyUpper.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyLower.setColorAt(idx, tp.tint);
      this.treeCanopyUpper.setColorAt(idx, tp.tint.clone().offsetHSL(0, 0, 0.04));

      this.physics.addStaticCylinder(tp.x, tp.y + 1.5, tp.z, 1.5, 0.34 * tp.s);
    });

    this.finalizeInstancedMesh(this.treeTrunks);
    this.finalizeInstancedMesh(this.treeCanopyLower);
    this.finalizeInstancedMesh(this.treeCanopyUpper);
    this.group.add(this.treeTrunks, this.treeCanopyLower, this.treeCanopyUpper);

    const rockPositions: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 120 && rockPositions.length < 75; i++) {
      const coastal = i < 28;
      const angle = (i / 28) * Math.PI * 2 + rand() * 0.18;
      const x = coastal ? Math.cos(angle) * (146 + rand() * 14) : (rand() - 0.5) * 265;
      const z = coastal ? Math.sin(angle) * (146 + rand() * 14) : (rand() - 0.5) * 265;
      if (!coastal && Math.hypot(x, z) > 142) continue;
      if (!coastal && x < -14 && z < -14) continue;
      if (!coastal && x > 14 && z < -14) continue;

      const y = this.heightAt(x, z);
      if (!coastal && y < 1.2) continue;

      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.4) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const s = coastal ? 1.8 + rand() * 2.2 : 0.9 + rand() * 1.4;
      rockPositions.push({
        x,
        y,
        z,
        sx: s * (0.9 + rand() * 0.35),
        sy: s * (0.65 + rand() * 0.35),
        sz: s * (0.9 + rand() * 0.35),
        ry: rand() * Math.PI * 2,
        tint: new THREE.Color().setScalar(0.62 + rand() * 0.25),
      });
    }

    this.rockCountMax = rockPositions.length;
    const rockGeo = this.regGeo(new THREE.DodecahedronGeometry(1.0, 0));
    this.rocksMesh = new THREE.InstancedMesh(rockGeo, this.materials.rock, this.rockCountMax);
    this.rocksMesh.castShadow = true;
    this.rocksMesh.receiveShadow = true;

    rockPositions.forEach((rp, idx) => {
      dummy.position.set(rp.x, rp.y + rp.sy * 0.38, rp.z);
      dummy.rotation.set(rand() * 0.4, rp.ry, rand() * 0.4);
      dummy.scale.set(rp.sx, rp.sy, rp.sz);
      dummy.updateMatrix();
      this.rocksMesh.setMatrixAt(idx, dummy.matrix);
      this.rocksMesh.setColorAt(idx, rp.tint);

      if (rp.sx > 1.1) {
        this.physics.addStaticBox(rp.x, rp.y + rp.sy * 0.4, rp.z, rp.sx * 0.72, rp.sy * 0.65, rp.sz * 0.72, rp.ry);
        this.obstacles.push({ x: rp.x, z: rp.z, radius: Math.max(rp.sx, rp.sz) * 0.85 });
      }
    });

    this.finalizeInstancedMesh(this.rocksMesh);
    this.group.add(this.rocksMesh);
  }

  // ===========================================================================
  // MAP 2: REDSTONE BASIN (Arid Airfield, Refinery, Canyon, Mesa)
  // ===========================================================================

  private buildAridAirfieldZone(): void {
    // NW Quadrant: Airfield Runway + Taxiway + Control Tower + 2 Open Hangars
    const runway = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(16, 0.08, 118)),
      this.materials.asphalt,
    );
    runway.position.set(-76, 2.63, -68);
    runway.receiveShadow = true;
    this.group.add(runway);

    // Runway centerline dashes
    for (let z = -118; z <= -22; z += 12) {
      const dash = new THREE.Mesh(
        this.regGeo(new THREE.BoxGeometry(0.6, 0.02, 5.5)),
        this.materials.hazardTrim,
      );
      dash.position.set(-76, 2.68, z);
      this.group.add(dash);
    }

    const taxiway = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(62, 0.07, 10)),
      this.materials.asphalt,
    );
    taxiway.position.set(-48, 2.62, -68);
    taxiway.receiveShadow = true;
    this.group.add(taxiway);

    // 2 Open-ended Aircraft Hangars
    const hangars = [
      { x: -42, z: -42, w: 18, d: 20, h: 7.4, rotY: 0 },
      { x: -102, z: -90, w: 16, d: 18, h: 7.0, rotY: 0 },
    ];
    hangars.forEach((hg) => {
      const y = this.heightAt(hg.x, hg.z);
      const grp = new THREE.Group();
      grp.position.set(hg.x, y, hg.z);
      grp.rotation.y = hg.rotY;

      this.addBoxPart(grp, hg.w + 0.8, 0.35, hg.d + 0.8, 0, 0.17, 0, this.materials.concreteDark, false);
      this.addBoxPart(grp, 0.6, hg.h, hg.d, -hg.w * 0.5 + 0.3, hg.h * 0.5 + 0.35, 0, this.materials.corrugatedSteel);
      this.addBoxPart(grp, 0.6, hg.h, hg.d, hg.w * 0.5 - 0.3, hg.h * 0.5 + 0.35, 0, this.materials.corrugatedSteel);
      // Stepped arched hangar roof
      this.addBoxPart(grp, hg.w + 0.8, 0.45, hg.d + 0.6, 0, hg.h + 0.55, 0, this.materials.rustSteel);
      this.addBoxPart(grp, hg.w * 0.72, 0.85, hg.d + 0.3, 0, hg.h + 1.15, 0, this.materials.corrugatedSteel);
      this.addBoxPart(grp, 0.8, hg.h, 0.8, -hg.w * 0.5 + 0.3, hg.h * 0.5 + 0.35, hg.d * 0.5 - 0.4, this.materials.hazardTrim);
      this.addBoxPart(grp, 0.8, hg.h, 0.8, hg.w * 0.5 - 0.3, hg.h * 0.5 + 0.35, hg.d * 0.5 - 0.4, this.materials.hazardTrim);

      this.group.add(grp);
      this.registerRotatedBox(hg.x, y + hg.h * 0.5 + 0.35, hg.z, -hg.w * 0.5 + 0.3, 0, 0.35, hg.h * 0.5, hg.d * 0.5, hg.rotY);
      this.registerRotatedBox(hg.x, y + hg.h * 0.5 + 0.35, hg.z, hg.w * 0.5 - 0.3, 0, 0.35, hg.h * 0.5, hg.d * 0.5, hg.rotY);
      this.obstacles.push({ x: hg.x, z: hg.z, radius: Math.max(hg.w, hg.d) * 0.56 });
    });

    // Air Traffic Control Tower (-38, -94)
    const tx = -38;
    const tz = -94;
    const ty = this.heightAt(tx, tz);
    const tower = new THREE.Group();
    tower.position.set(tx, ty, tz);
    this.addBoxPart(tower, 8.6, 0.5, 8.6, 0, 0.25, 0, this.materials.concreteDark, false);
    this.addBoxPart(tower, 5.4, 9.2, 5.4, 0, 5.1, 0, this.materials.sandstone);
    this.addBoxPart(tower, 7.2, 2.4, 7.2, 0, 10.9, 0, this.materials.concreteWall);
    this.addBoxPart(tower, 7.5, 0.4, 7.5, 0, 12.2, 0, this.materials.gunMetal);
    this.addCylinderPart(tower, 0.25, 0.35, 3.2, 8, 0, 13.8, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 2.4, 0.8, 0.3, 0, 14.9, 0, this.materials.hazardTrim);
    this.group.add(tower);
    this.physics.addStaticBox(tx, ty + 5.1, tz, 2.75, 5.1, 2.75);
    this.obstacles.push({ x: tx, z: tz, radius: 5.0 });

    // Apron Jersey Blast Barriers & Cargo Stacks
    const barriers: Array<[number, number, number]> = [
      [-60, -48, 0.1],
      [-58, -82, -0.2],
      [-92, -52, Math.PI / 2],
      [-92, -68, Math.PI / 2],
      [-48, -60, 0],
    ];
    barriers.forEach(([bx, bz, rot]) => {
      const y = this.heightAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y, bz);
      grp.rotation.y = rot;
      this.addBoxPart(grp, 3.6, 1.15, 0.85, 0, 0.58, 0, this.materials.concreteWall);
      this.addBoxPart(grp, 3.7, 0.18, 0.9, 0, 1.12, 0, this.materials.hazardTrim, false);
      this.group.add(grp);
      this.physics.addStaticBox(bx, y + 0.6, bz, 1.85, 0.6, 0.46, rot);
      this.obstacles.push({ x: bx, z: bz, radius: 2.1 });
    });
  }

  private buildAridRefineryZone(): void {
    const pad = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(92, 0.08, 92)),
      this.materials.concreteDark,
    );
    pad.position.set(68, 3.02, -68);
    pad.receiveShadow = true;
    this.group.add(pad);

    // 2 Multi-Part Oil Derricks / Pump Towers
    const derricks = [
      { x: 50, z: -48 },
      { x: 94, z: -84 },
    ];
    derricks.forEach((dk) => {
      const y = this.heightAt(dk.x, dk.z);
      const grp = new THREE.Group();
      grp.position.set(dk.x, y, dk.z);
      this.addBoxPart(grp, 9.0, 0.5, 9.0, 0, 0.25, 0, this.materials.concreteDark, false);
      const offsets = [-2.4, 2.4];
      offsets.forEach((lx) => {
        offsets.forEach((lz) => {
          this.addBoxPart(grp, 0.45, 9.6, 0.45, lx, 5.0, lz, this.materials.rustSteel);
          this.physics.addStaticBox(dk.x + lx, y + 5.0, dk.z + lz, 0.3, 5.0, 0.3);
        });
      });
      this.addBoxPart(grp, 5.6, 0.45, 5.6, 0, 5.2, 0, this.materials.industrialAccent);
      this.addBoxPart(grp, 4.4, 0.45, 4.4, 0, 9.8, 0, this.materials.hazardTrim);
      this.addBoxPart(grp, 1.2, 3.5, 1.2, 0, 11.7, 0, this.materials.gunMetal);
      this.group.add(grp);
      this.obstacles.push({ x: dk.x, z: dk.z, radius: 5.2 });
    });

    // 4 Weathered Rust Fuel Silos
    const tanks: Array<[number, number, number, number]> = [
      [88, -42, 4.4, 8.2],
      [101, -42, 4.4, 8.2],
      [88, -56, 3.8, 7.2],
      [101, -56, 3.8, 7.2],
    ];
    tanks.forEach(([sx, sz, r, h]) => {
      const y = this.heightAt(sx, sz);
      const grp = new THREE.Group();
      grp.position.set(sx, y, sz);
      this.addCylinderPart(grp, r + 0.35, r + 0.35, 0.6, 16, 0, 0.3, 0, this.materials.concreteDark, false);
      this.addCylinderPart(grp, r, r, h, 16, 0, h * 0.5 + 0.6, 0, this.materials.rustSteel);
      this.addCylinderPart(grp, r + 0.14, r + 0.14, 0.5, 16, 0, h * 0.72, 0, this.materials.hazardTrim);
      this.addCylinderPart(grp, r * 0.7, r, 0.9, 16, 0, h + 1.0, 0, this.materials.corrugatedSteel);
      this.group.add(grp);
      this.physics.addStaticCylinder(sx, y + h * 0.5 + 0.6, sz, h * 0.5 + 0.6, r);
      this.obstacles.push({ x: sx, z: sz, radius: r + 0.6 });
    });

    // Overhead refinery pipe span
    const pipe = new THREE.Mesh(
      this.regGeo(new THREE.CylinderGeometry(0.45, 0.45, 14, 10)),
      this.materials.hazardTrim,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(94.5, this.heightAt(94, -42) + 7.2, -42);
    pipe.castShadow = true;
    this.group.add(pipe);

    // Desert shipping containers
    const containers = [
      { x: 46, z: -84, rot: 0.15, mat: this.materials.containerRust },
      { x: 58, z: -92, rot: -0.25, mat: this.materials.containerOlive },
      { x: 66, z: -74, rot: Math.PI / 2, mat: this.materials.containerSlate },
      { x: 44, z: -98, rot: 0, mat: this.materials.containerRust },
      { x: 76, z: -102, rot: 0.4, mat: this.materials.containerOlive },
    ];
    containers.forEach((c) => {
      const y = this.heightAt(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rot;
      this.addBoxPart(grp, 6.2, 2.7, 2.5, 0, 1.35, 0, c.mat);
      this.addBoxPart(grp, 6.35, 0.2, 2.62, 0, 2.72, 0, this.materials.rustSteel);
      this.group.add(grp);
      this.physics.addStaticBox(c.x, y + 1.38, c.z, 3.12, 1.38, 1.28, c.rot);
      this.obstacles.push({ x: c.x, z: c.z, radius: 3.4 });
    });
  }

  private buildAridMesaZone(): void {
    // Mesa Summit Radio Fortification at (76, 76)
    const ox = 76;
    const oz = 76;
    const oy = this.heightAt(ox, oz);

    const fort = new THREE.Group();
    fort.position.set(ox, oy, oz);
    this.addBoxPart(fort, 8.4, 0.5, 8.4, 0, 0.25, 0, this.materials.concreteDark, false);

    // Reinforced bunker walls around observation deck + radio mast
    this.addBoxPart(fort, 8.0, 2.4, 0.65, 0, 1.4, -3.7, this.materials.sandstone);
    this.addBoxPart(fort, 0.65, 2.4, 8.0, 3.7, 1.4, 0, this.materials.sandstone);
    this.addBoxPart(fort, 2.6, 2.4, 0.65, -2.7, 1.4, 3.7, this.materials.sandstone);
    this.addBoxPart(fort, 2.6, 2.4, 0.65, 2.7, 1.4, 3.7, this.materials.sandstone);
    this.addBoxPart(fort, 8.6, 0.4, 8.6, 0, 4.1, 0, this.materials.rustSteel);

    const legOffsets = [-3.2, 3.2];
    legOffsets.forEach((lx) => {
      legOffsets.forEach((lz) => {
        this.addBoxPart(fort, 0.45, 3.8, 0.45, lx, 2.0, lz, this.materials.gunMetal);
      });
    });

    // Comms dish + solar panel wing on roof
    this.addCylinderPart(fort, 0.22, 0.3, 3.6, 8, 1.8, 5.9, -1.5, this.materials.gunMetal);
    this.addBoxPart(fort, 2.6, 0.14, 1.6, -1.8, 4.9, 1.2, this.materials.industrialAccent);

    this.group.add(fort);
    this.physics.addStaticBox(ox, oy + 1.4, oz - 3.7, 4.0, 1.3, 0.35);
    this.physics.addStaticBox(ox + 3.7, oy + 1.4, oz, 0.35, 1.3, 4.0);
    this.physics.addStaticBox(ox - 2.7, oy + 1.4, oz + 3.7, 1.3, 1.3, 0.35);
    this.physics.addStaticBox(ox + 2.7, oy + 1.4, oz + 3.7, 1.3, 1.3, 0.35);
    this.obstacles.push({ x: ox, z: oz, radius: 5.5 });

    // Flanking sandstone mesa barricades
    const walls: Array<[number, number, number]> = [
      [54, 58, 0.6],
      [96, 62, -0.5],
      [60, 96, 0.25],
    ];
    walls.forEach(([wx, wz, rot]) => {
      const y = this.heightAt(wx, wz);
      const grp = new THREE.Group();
      grp.position.set(wx, y, wz);
      grp.rotation.y = rot;
      this.addBoxPart(grp, 4.8, 1.35, 0.9, 0, 0.65, 0, this.materials.sandstone);
      this.addBoxPart(grp, 5.0, 0.22, 1.0, 0, 1.35, 0, this.materials.concreteDark);
      this.group.add(grp);
      this.physics.addStaticBox(wx, y + 0.65, wz, 2.45, 0.7, 0.5, rot);
      this.obstacles.push({ x: wx, z: wz, radius: 2.6 });
    });
  }

  private buildAridCanyonStructures(): void {
    // 2 Desert Outpost Shacks + 4 Layered Sandstone Monoliths / Buttes in SW
    const shacks = [
      { x: -46, z: 54, rotY: 0.35 },
      { x: -88, z: 86, rotY: -0.55 },
    ];
    shacks.forEach((c) => {
      const y = this.heightAt(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rotY;

      const w = 8.2;
      const d = 7.0;
      const h = 3.5;
      this.addBoxPart(grp, w + 0.6, 0.45, d + 1.4, 0, 0.22, 0.3, this.materials.sandstone, false);
      this.addBoxPart(grp, w, h, 0.4, 0, h * 0.5 + 0.4, -d * 0.5 + 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, 0.4, h, d, -w * 0.5 + 0.2, h * 0.5 + 0.4, 0, this.materials.woodPlank);
      this.addBoxPart(grp, 0.4, h, d, w * 0.5 - 0.2, h * 0.5 + 0.4, 0, this.materials.woodPlank);
      this.addBoxPart(grp, 2.5, h, 0.4, -w * 0.5 + 1.25, h * 0.5 + 0.4, d * 0.5 - 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, 2.5, h, 0.4, w * 0.5 - 1.25, h * 0.5 + 0.4, d * 0.5 - 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, w + 1.0, 0.3, d + 1.6, 0, h + 0.55, 0.3, this.materials.rustSteel);
      this.group.add(grp);

      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, 0, -d * 0.5 + 0.2, w * 0.5, h * 0.5, 0.25, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, -w * 0.5 + 0.2, 0, 0.25, h * 0.5, d * 0.5, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, w * 0.5 - 0.2, 0, 0.25, h * 0.5, d * 0.5, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, -w * 0.5 + 1.25, d * 0.5 - 0.2, 1.25, h * 0.5, 0.25, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, w * 0.5 - 1.25, d * 0.5 - 0.2, 1.25, h * 0.5, 0.25, c.rotY);
      this.obstacles.push({ x: c.x, z: c.z, radius: 5.4 });
    });

    // Monumental Layered Sandstone Buttes
    const buttes: Array<[number, number, number, number]> = [
      [-68, 66, 6.2, 8.5],
      [-36, 98, 5.4, 7.0],
      [-104, 50, 6.8, 9.2],
      [-64, 114, 5.8, 7.6],
    ];
    buttes.forEach(([bx, bz, w, h]) => {
      const y = this.heightAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y - 0.3, bz);
      this.addBoxPart(grp, w, h * 0.45, w * 0.85, 0, h * 0.22, 0, this.materials.sandstone);
      this.addBoxPart(grp, w * 0.8, h * 0.35, w * 0.72, 0.2, h * 0.62, -0.1, this.materials.brickWarm);
      this.addBoxPart(grp, w * 0.66, h * 0.25, w * 0.6, -0.1, h * 0.9, 0.1, this.materials.sandstone);
      this.group.add(grp);
      this.physics.addStaticBox(bx, y + h * 0.45, bz, w * 0.48, h * 0.48, w * 0.42);
      this.obstacles.push({ x: bx, z: bz, radius: w * 0.68 });
    });
  }

  private buildAridInstancedProps(): void {
    let seed = 8831;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Desert Cacti / Dry Scrub clusters (re-using treeTrunks / treeCanopy slots for consistent quality scaling)
    const scrubPositions: Array<{ x: number; y: number; z: number; s: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 200 && scrubPositions.length < 90; i++) {
      const inCanyon = i < 120;
      const x = inCanyon ? -14 - rand() * 124 : (rand() - 0.5) * 260;
      const z = inCanyon ? 14 + rand() * 124 : (rand() - 0.5) * 260;
      if (Math.hypot(x, z) > 138) continue;
      if (x < -12 && z < -12) continue;
      if (x > 12 && z < -12) continue;

      const y = this.heightAt(x, z);
      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const scale = 0.78 + rand() * 0.4;
      const tint = new THREE.Color().setHSL(
        0.26 + (rand() - 0.5) * 0.04,
        0.42 + rand() * 0.12,
        0.30 + rand() * 0.10,
        THREE.SRGBColorSpace,
      );
      scrubPositions.push({ x, y, z, s: scale, tint });
      this.obstacles.push({ x, z, radius: 0.65 * scale });
    }

    this.treeCountMax = scrubPositions.length;
    const stemGeo = this.regGeo(new THREE.CylinderGeometry(0.22, 0.28, 2.8, 7));
    stemGeo.translate(0, 1.4, 0);
    const armLowGeo = this.regGeo(new THREE.CylinderGeometry(0.15, 0.18, 1.3, 6));
    armLowGeo.translate(0.36, 1.75, 0);
    const armHighGeo = this.regGeo(new THREE.CylinderGeometry(0.14, 0.17, 1.15, 6));
    armHighGeo.translate(-0.34, 2.05, 0);

    this.treeTrunks = new THREE.InstancedMesh(stemGeo, this.materials.cactusGreen, this.treeCountMax);
    this.treeCanopyLower = new THREE.InstancedMesh(armLowGeo, this.materials.cactusGreen, this.treeCountMax);
    this.treeCanopyUpper = new THREE.InstancedMesh(armHighGeo, this.materials.cactusGreen, this.treeCountMax);

    this.treeTrunks.castShadow = true;
    this.treeTrunks.receiveShadow = true;
    this.treeCanopyLower.castShadow = true;
    this.treeCanopyUpper.castShadow = true;

    const dummy = new THREE.Object3D();
    scrubPositions.forEach((sp, idx) => {
      dummy.position.set(sp.x, sp.y - 0.08, sp.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(sp.s, sp.s, sp.s);
      dummy.updateMatrix();
      this.treeTrunks.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyLower.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyUpper.setMatrixAt(idx, dummy.matrix);
      this.treeTrunks.setColorAt(idx, sp.tint);
      this.treeCanopyLower.setColorAt(idx, sp.tint);
      this.treeCanopyUpper.setColorAt(idx, sp.tint.clone().offsetHSL(0, 0, 0.04));

      this.physics.addStaticCylinder(sp.x, sp.y + 1.3, sp.z, 1.3, 0.28 * sp.s);
    });

    this.finalizeInstancedMesh(this.treeTrunks);
    this.finalizeInstancedMesh(this.treeCanopyLower);
    this.finalizeInstancedMesh(this.treeCanopyUpper);
    this.group.add(this.treeTrunks, this.treeCanopyLower, this.treeCanopyUpper);

    // Sandstone Boulders & Rim Crags
    const rockPositions: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 140 && rockPositions.length < 85; i++) {
      const rim = i < 34;
      const angle = (i / 34) * Math.PI * 2 + rand() * 0.16;
      const x = rim ? Math.cos(angle) * (142 + rand() * 14) : (rand() - 0.5) * 265;
      const z = rim ? Math.sin(angle) * (142 + rand() * 14) : (rand() - 0.5) * 265;
      if (!rim && Math.hypot(x, z) > 138) continue;
      if (!rim && x < -14 && z < -14) continue;
      if (!rim && x > 14 && z < -14) continue;

      const y = this.heightAt(x, z);
      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.4) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const s = rim ? 2.2 + rand() * 2.4 : 1.0 + rand() * 1.5;
      rockPositions.push({
        x,
        y,
        z,
        sx: s * (0.9 + rand() * 0.4),
        sy: s * (0.7 + rand() * 0.45),
        sz: s * (0.9 + rand() * 0.4),
        ry: rand() * Math.PI * 2,
        tint: new THREE.Color().setHSL(
          0.055 + rand() * 0.025,
          0.38 + rand() * 0.12,
          0.42 + rand() * 0.14,
          THREE.SRGBColorSpace,
        ),
      });
    }

    this.rockCountMax = rockPositions.length;
    const rockGeo = this.regGeo(new THREE.DodecahedronGeometry(1.0, 0));
    this.rocksMesh = new THREE.InstancedMesh(rockGeo, this.materials.cactusGreen, this.rockCountMax);
    this.rocksMesh.castShadow = true;
    this.rocksMesh.receiveShadow = true;

    rockPositions.forEach((rp, idx) => {
      dummy.position.set(rp.x, rp.y + rp.sy * 0.36, rp.z);
      dummy.rotation.set(rand() * 0.35, rp.ry, rand() * 0.35);
      dummy.scale.set(rp.sx, rp.sy, rp.sz);
      dummy.updateMatrix();
      this.rocksMesh.setMatrixAt(idx, dummy.matrix);
      this.rocksMesh.setColorAt(idx, rp.tint);

      if (rp.sx > 1.1) {
        this.physics.addStaticBox(rp.x, rp.y + rp.sy * 0.4, rp.z, rp.sx * 0.72, rp.sy * 0.65, rp.sz * 0.72, rp.ry);
        this.obstacles.push({ x: rp.x, z: rp.z, radius: Math.max(rp.sx, rp.sz) * 0.85 });
      }
    });

    this.finalizeInstancedMesh(this.rocksMesh);
    this.group.add(this.rocksMesh);
  }

  // ===========================================================================
  // MAP 3: FROSTBITE RIDGE (Arctic Outpost, Freight Yard, Pine Woods, Glacier)
  // ===========================================================================

  private buildFrostOutpostZone(): void {
    // Snow-cleared cross avenues + Raised Helipad
    const roadNS = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(10, 0.06, 112)),
      this.materials.concreteDark,
    );
    roadNS.position.set(-64, 2.63, -68);
    roadNS.receiveShadow = true;
    this.group.add(roadNS);

    const roadEW = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(112, 0.06, 10)),
      this.materials.concreteDark,
    );
    roadEW.position.set(-68, 2.635, -64);
    roadEW.receiveShadow = true;
    this.group.add(roadEW);

    // Helipad (-42, -42)
    const hx = -42;
    const hz = -42;
    const hy = this.heightAt(hx, hz);
    const heliGrp = new THREE.Group();
    heliGrp.position.set(hx, hy, hz);
    this.addCylinderPart(heliGrp, 7.5, 7.8, 0.4, 20, 0, 0.2, 0, this.materials.concreteDark, false);
    this.addBoxPart(heliGrp, 1.1, 0.04, 5.2, -1.8, 0.42, 0, this.materials.hazardTrim, false);
    this.addBoxPart(heliGrp, 1.1, 0.04, 5.2, 1.8, 0.42, 0, this.materials.hazardTrim, false);
    this.addBoxPart(heliGrp, 4.4, 0.04, 1.0, 0, 0.42, 0, this.materials.hazardTrim, false);
    this.group.add(heliGrp);

    // 5 Insulated Arctic Research Modules
    const modules = [
      { x: -86, z: -44, w: 15, d: 11, h: 5.4, rotY: Math.PI / 2 },
      { x: -44, z: -86, w: 14, d: 11, h: 5.0, rotY: Math.PI },
      { x: -88, z: -88, w: 15, d: 14, h: 7.5, rotY: 0 },
      { x: -28, z: -102, w: 11, d: 9.5, h: 4.8, rotY: -Math.PI / 2 },
      { x: -108, z: -64, w: 12, d: 14, h: 5.8, rotY: 0 },
    ];
    modules.forEach((m) => {
      const groundY = this.heightAt(m.x, m.z);
      const grp = new THREE.Group();
      grp.position.set(m.x, groundY, m.z);
      grp.rotation.y = m.rotY;

      this.addBoxPart(grp, m.w + 0.8, 0.5, m.d + 0.8, 0, 0.25, 0, this.materials.concreteDark, false);
      const wallThick = 0.65;
      const doorW = 3.4;
      const sideW = (m.w - doorW) * 0.5;

      this.addBoxPart(grp, m.w, m.h, wallThick, 0, m.h * 0.5 + 0.5, -m.d * 0.5 + wallThick * 0.5, this.materials.arcticMetal);
      this.addBoxPart(grp, wallThick, m.h, m.d, -m.w * 0.5 + wallThick * 0.5, m.h * 0.5 + 0.5, 0, this.materials.arcticMetal);
      this.addBoxPart(grp, wallThick, m.h, m.d, m.w * 0.5 - wallThick * 0.5, m.h * 0.5 + 0.5, 0, this.materials.arcticMetal);
      this.addBoxPart(grp, sideW, m.h, wallThick, -m.w * 0.5 + sideW * 0.5, m.h * 0.5 + 0.5, m.d * 0.5 - wallThick * 0.5, this.materials.arcticMetal);
      this.addBoxPart(grp, sideW, m.h, wallThick, m.w * 0.5 - sideW * 0.5, m.h * 0.5 + 0.5, m.d * 0.5 - wallThick * 0.5, this.materials.arcticMetal);
      this.addBoxPart(grp, doorW, m.h - 2.8, wallThick, 0, 2.8 + (m.h - 2.8) * 0.5 + 0.5, m.d * 0.5 - wallThick * 0.5, this.materials.hazardTrim);

      // Snow-topped roof & arctic sensor dome
      this.addBoxPart(grp, m.w + 0.6, 0.45, m.d + 0.6, 0, m.h + 0.72, 0, this.materials.industrialAccent);
      this.addBoxPart(grp, m.w + 0.3, 0.25, m.d + 0.3, 0, m.h + 1.05, 0, this.materials.snowGround, false);
      this.addCylinderPart(grp, 1.3, 1.5, 1.1, 10, -m.w * 0.2, m.h + 1.6, -m.d * 0.15, this.materials.arcticMetal);
      this.addCylinderPart(grp, 0.15, 0.18, 2.2, 6, m.w * 0.26, m.h + 2.1, m.d * 0.18, this.materials.gunMetal);

      this.group.add(grp);

      this.registerRotatedBox(m.x, groundY + m.h * 0.5 + 0.5, m.z, 0, -m.d * 0.5 + wallThick * 0.5, m.w * 0.5, m.h * 0.5, wallThick * 0.5, m.rotY);
      this.registerRotatedBox(m.x, groundY + m.h * 0.5 + 0.5, m.z, -m.w * 0.5 + wallThick * 0.5, 0, wallThick * 0.5, m.h * 0.5, m.d * 0.5, m.rotY);
      this.registerRotatedBox(m.x, groundY + m.h * 0.5 + 0.5, m.z, m.w * 0.5 - wallThick * 0.5, 0, wallThick * 0.5, m.h * 0.5, m.d * 0.5, m.rotY);
      this.registerRotatedBox(m.x, groundY + m.h * 0.5 + 0.5, m.z, -m.w * 0.5 + sideW * 0.5, m.d * 0.5 - wallThick * 0.5, sideW * 0.5, m.h * 0.5, wallThick * 0.5, m.rotY);
      this.registerRotatedBox(m.x, groundY + m.h * 0.5 + 0.5, m.z, m.w * 0.5 - sideW * 0.5, m.d * 0.5 - wallThick * 0.5, sideW * 0.5, m.h * 0.5, wallThick * 0.5, m.rotY);
      this.obstacles.push({ x: m.x, z: m.z, radius: Math.max(m.w, m.d) * 0.6 });
    });

    // Snow-berm concrete barriers
    const barriers: Array<[number, number, number]> = [
      [-56, -48, 0],
      [-72, -55, 0.2],
      [-56, -78, -0.15],
      [-82, -70, Math.PI / 2],
    ];
    barriers.forEach(([bx, bz, rot]) => {
      const y = this.heightAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y, bz);
      grp.rotation.y = rot;
      this.addBoxPart(grp, 3.3, 0.95, 0.72, 0, 0.48, 0, this.materials.concreteDark);
      this.addBoxPart(grp, 3.4, 0.16, 0.78, 0, 0.96, 0, this.materials.snowGround, false);
      this.group.add(grp);
      this.physics.addStaticBox(bx, y + 0.5, bz, 1.7, 0.5, 0.4, rot);
      this.obstacles.push({ x: bx, z: bz, radius: 1.9 });
    });
  }

  private buildFrostFreightZone(): void {
    const yardPad = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(92, 0.08, 92)),
      this.materials.concreteDark,
    );
    yardPad.position.set(68, 2.42, -68);
    yardPad.receiveShadow = true;
    this.group.add(yardPad);

    const depots = [
      { x: 52, z: -48, w: 18, d: 22, h: 7.8, rotY: 0 },
      { x: 92, z: -82, w: 16, d: 22, h: 7.4, rotY: Math.PI / 2 },
    ];
    depots.forEach((w) => {
      const y = this.heightAt(w.x, w.z);
      const grp = new THREE.Group();
      grp.position.set(w.x, y, w.z);
      grp.rotation.y = w.rotY;

      this.addBoxPart(grp, w.w + 0.8, 0.35, w.d + 0.8, 0, 0.175, 0, this.materials.concreteDark, false);
      this.addBoxPart(grp, 0.55, w.h, w.d, -w.w * 0.5 + 0.28, w.h * 0.5 + 0.35, 0, this.materials.industrialAccent);
      this.addBoxPart(grp, 0.55, w.h, w.d, w.w * 0.5 - 0.28, w.h * 0.5 + 0.35, 0, this.materials.industrialAccent);
      this.addBoxPart(grp, w.w + 0.8, 0.45, w.d + 0.8, 0, w.h + 0.55, 0, this.materials.arcticMetal);
      this.addBoxPart(grp, w.w * 0.72, 0.55, w.d + 0.3, 0, w.h + 1.0, 0, this.materials.snowGround);
      this.group.add(grp);

      this.registerRotatedBox(w.x, y + w.h * 0.5 + 0.35, w.z, -w.w * 0.5 + 0.28, 0, 0.35, w.h * 0.5, w.d * 0.5, w.rotY);
      this.registerRotatedBox(w.x, y + w.h * 0.5 + 0.35, w.z, w.w * 0.5 - 0.28, 0, 0.35, w.h * 0.5, w.d * 0.5, w.rotY);
      this.obstacles.push({ x: w.x, z: w.z, radius: Math.max(w.w, w.d) * 0.55 });
    });

    // Insulated Fuel Cisterns
    const cisterns: Array<[number, number, number, number]> = [
      [88, -42, 4.0, 8.8],
      [100, -42, 4.0, 8.8],
      [88, -55, 3.4, 7.6],
    ];
    cisterns.forEach(([sx, sz, r, h]) => {
      const y = this.heightAt(sx, sz);
      const grp = new THREE.Group();
      grp.position.set(sx, y, sz);
      this.addCylinderPart(grp, r + 0.3, r + 0.3, 0.6, 16, 0, 0.3, 0, this.materials.concreteDark, false);
      this.addCylinderPart(grp, r, r, h, 16, 0, h * 0.5 + 0.6, 0, this.materials.arcticMetal);
      this.addCylinderPart(grp, r + 0.12, r + 0.12, 0.5, 16, 0, h * 0.75, 0, this.materials.hazardTrim);
      this.addCylinderPart(grp, r * 0.85, r, 0.6, 16, 0, h + 0.9, 0, this.materials.snowGround);
      this.group.add(grp);
      this.physics.addStaticCylinder(sx, y + h * 0.5 + 0.6, sz, h * 0.5 + 0.6, r);
      this.obstacles.push({ x: sx, z: sz, radius: r + 0.5 });
    });

    // Frost-dusted freight containers
    const containers = [
      { x: 46, z: -84, rot: 0.1, mat: this.materials.containerSlate },
      { x: 56, z: -90, rot: -0.2, mat: this.materials.arcticMetal },
      { x: 64, z: -76, rot: Math.PI / 2, mat: this.materials.containerSlate },
      { x: 44, z: -96, rot: 0, mat: this.materials.containerOlive },
      { x: 75, z: -98, rot: 0.35, mat: this.materials.containerSlate },
    ];
    containers.forEach((c) => {
      const y = this.heightAt(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rot;
      this.addBoxPart(grp, 6.2, 2.7, 2.5, 0, 1.35, 0, c.mat);
      this.addBoxPart(grp, 6.2, 0.25, 2.5, 0, 2.78, 0, this.materials.snowGround, false);
      this.group.add(grp);
      this.physics.addStaticBox(c.x, y + 1.38, c.z, 3.12, 1.38, 1.28, c.rot);
      this.obstacles.push({ x: c.x, z: c.z, radius: 3.4 });
    });
  }

  private buildFrostGlacierZone(): void {
    // Glacier Peak Meteorological Outpost at (74, 74)
    const ox = 74;
    const oz = 74;
    const oy = this.heightAt(ox, oz);

    const station = new THREE.Group();
    station.position.set(ox, oy, oz);
    this.addBoxPart(station, 7.6, 0.6, 7.6, 0, 0.2, 0, this.materials.concreteDark, false);

    const legOffsets = [-2.6, 2.6];
    legOffsets.forEach((lx) => {
      legOffsets.forEach((lz) => {
        this.addBoxPart(station, 0.48, 5.2, 0.48, lx, 2.6, lz, this.materials.gunMetal);
        this.physics.addStaticBox(ox + lx, oy + 2.6, oz + lz, 0.3, 2.6, 0.3);
      });
    });
    this.addBoxPart(station, 6.8, 0.35, 6.8, 0, 5.2, 0, this.materials.arcticMetal);
    this.addBoxPart(station, 6.8, 0.9, 0.22, 0, 5.8, 3.25, this.materials.hazardTrim);
    this.addBoxPart(station, 6.8, 0.9, 0.22, 0, 5.8, -3.25, this.materials.hazardTrim);
    this.addBoxPart(station, 0.22, 0.9, 6.8, -3.25, 5.8, 0, this.materials.hazardTrim);
    this.addBoxPart(station, 0.22, 0.9, 6.8, 3.25, 5.8, 0, this.materials.hazardTrim);
    this.addBoxPart(station, 5.4, 0.35, 5.4, 0, 8.0, 0, this.materials.snowGround);
    this.addCylinderPart(station, 0.2, 0.28, 3.4, 8, 0, 9.8, 0, this.materials.gunMetal);
    this.addBoxPart(station, 2.4, 0.4, 0.25, 0, 11.2, 0, this.materials.arcticMetal);

    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const sx = -3.6 - (1 - t) * 5.2;
      const sy = t * 5.0;
      this.addBoxPart(station, 0.75, 0.28, 2.2, sx, sy, 0, this.materials.industrialAccent);
      this.physics.addStaticBox(ox + sx, oy + sy - 0.1, oz, 0.45, 0.25, 1.1);
    }

    this.group.add(station);
    this.obstacles.push({ x: ox, z: oz, radius: 5.0 });

    // Glacier Ice-Rock Bunkers
    const bunkers: Array<[number, number, number]> = [
      [54, 54, 0.7],
      [96, 62, -0.5],
      [60, 96, 0.2],
    ];
    bunkers.forEach(([bx, bz, rot]) => {
      const y = this.heightAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y, bz);
      grp.rotation.y = rot;
      this.addBoxPart(grp, 4.4, 1.25, 0.85, 0, 0.6, 0, this.materials.glacierIce);
      this.addBoxPart(grp, 4.6, 0.25, 0.95, 0, 1.3, 0, this.materials.snowGround, false);
      this.group.add(grp);
      this.physics.addStaticBox(bx, y + 0.65, bz, 2.3, 0.7, 0.5, rot);
      this.obstacles.push({ x: bx, z: bz, radius: 2.4 });
    });
  }

  private buildFrostWoodsStructures(): void {
    const cabins = [
      { x: -48, z: 54, rotY: 0.4 },
      { x: -88, z: 86, rotY: -0.6 },
    ];
    cabins.forEach((c) => {
      const y = this.heightAt(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rotY;

      const w = 8.4;
      const d = 7.4;
      const h = 3.6;

      this.addBoxPart(grp, w + 0.6, 0.45, d + 1.8, 0, 0.22, 0.5, this.materials.concreteDark, false);
      this.addBoxPart(grp, w, h, 0.4, 0, h * 0.5 + 0.4, -d * 0.5 + 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, 0.4, h, d, -w * 0.5 + 0.2, h * 0.5 + 0.4, 0, this.materials.woodPlank);
      this.addBoxPart(grp, 0.4, h, d, w * 0.5 - 0.2, h * 0.5 + 0.4, 0, this.materials.woodPlank);
      this.addBoxPart(grp, 2.7, h, 0.4, -w * 0.5 + 1.35, h * 0.5 + 0.4, d * 0.5 - 0.2, this.materials.woodPlank);
      this.addBoxPart(grp, 2.7, h, 0.4, w * 0.5 - 1.35, h * 0.5 + 0.4, d * 0.5 - 0.2, this.materials.woodPlank);
      // Heavy snow-capped alpine roof
      this.addBoxPart(grp, w + 1.1, 0.35, d + 2.1, 0, h + 0.55, 0.5, this.materials.concreteDark);
      this.addBoxPart(grp, w * 0.72, 0.9, d + 1.6, 0, h + 1.15, 0.5, this.materials.snowGround);

      this.group.add(grp);

      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, 0, -d * 0.5 + 0.2, w * 0.5, h * 0.5, 0.25, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, -w * 0.5 + 0.2, 0, 0.25, h * 0.5, d * 0.5, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, w * 0.5 - 0.2, 0, 0.25, h * 0.5, d * 0.5, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, -w * 0.5 + 1.35, d * 0.5 - 0.2, 1.35, h * 0.5, 0.25, c.rotY);
      this.registerRotatedBox(c.x, y + h * 0.5 + 0.4, c.z, w * 0.5 - 1.35, d * 0.5 - 0.2, 1.35, h * 0.5, 0.25, c.rotY);
      this.obstacles.push({ x: c.x, z: c.z, radius: 5.5 });
    });
  }

  private buildFrostInstancedProps(): void {
    let seed = 6109;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Snow-frosted Alpine Pines
    const treePositions: Array<{ x: number; y: number; z: number; s: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 230 && treePositions.length < 120; i++) {
      const inForest = i < 160;
      const x = inForest ? -14 - rand() * 124 : (rand() - 0.5) * 260;
      const z = inForest ? 14 + rand() * 124 : (rand() - 0.5) * 260;
      if (Math.hypot(x, z) > 142) continue;
      if (x < -12 && z < -12) continue;
      if (x > 12 && z < -12) continue;

      const y = this.heightAt(x, z);
      if (y < 1.2 || y > 15.0) continue;

      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const scale = 0.84 + rand() * 0.36;
      const tint = new THREE.Color().setHSL(0.42 + (rand() - 0.5) * 0.05, 0.16 + rand() * 0.1, 0.38 + rand() * 0.14);
      treePositions.push({ x, y, z, s: scale, tint });
      this.obstacles.push({ x, z, radius: 0.75 * scale });
    }

    this.treeCountMax = treePositions.length;
    const trunkGeo = this.regGeo(new THREE.CylinderGeometry(0.24, 0.42, 3.2, 6));
    trunkGeo.translate(0, 1.6, 0);
    const canopyLowGeo = this.regGeo(new THREE.ConeGeometry(2.3, 4.2, 7));
    canopyLowGeo.translate(0, 4.3, 0);
    const canopyHighGeo = this.regGeo(new THREE.ConeGeometry(1.65, 3.4, 7));
    canopyHighGeo.translate(0, 6.4, 0);

    this.treeTrunks = new THREE.InstancedMesh(trunkGeo, this.materials.treeBark, this.treeCountMax);
    this.treeCanopyLower = new THREE.InstancedMesh(canopyLowGeo, this.materials.treeFoliage, this.treeCountMax);
    this.treeCanopyUpper = new THREE.InstancedMesh(canopyHighGeo, this.materials.treeFoliage, this.treeCountMax);

    this.treeTrunks.castShadow = true;
    this.treeCanopyLower.castShadow = true;
    this.treeCanopyLower.receiveShadow = true;
    this.treeCanopyUpper.castShadow = true;
    this.treeCanopyUpper.receiveShadow = true;

    const dummy = new THREE.Object3D();
    treePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y - 0.1, tp.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(tp.s, tp.s, tp.s);
      dummy.updateMatrix();
      this.treeTrunks.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyLower.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyUpper.setMatrixAt(idx, dummy.matrix);
      this.treeCanopyLower.setColorAt(idx, tp.tint);
      // Frost-dusted upper tier
      this.treeCanopyUpper.setColorAt(idx, tp.tint.clone().lerp(new THREE.Color(0xdbe6ef), 0.48));

      this.physics.addStaticCylinder(tp.x, tp.y + 1.5, tp.z, 1.5, 0.34 * tp.s);
    });

    this.finalizeInstancedMesh(this.treeTrunks);
    this.finalizeInstancedMesh(this.treeCanopyLower);
    this.finalizeInstancedMesh(this.treeCanopyUpper);
    this.group.add(this.treeTrunks, this.treeCanopyLower, this.treeCanopyUpper);

    // Granite Coastal & Mountain Boulders
    const rockPositions: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 110 && rockPositions.length < 65; i++) {
      const coastal = i < 24;
      const angle = (i / 24) * Math.PI * 2 + rand() * 0.18;
      const x = coastal ? Math.cos(angle) * (146 + rand() * 14) : (rand() - 0.5) * 265;
      const z = coastal ? Math.sin(angle) * (146 + rand() * 14) : (rand() - 0.5) * 265;
      if (!coastal && Math.hypot(x, z) > 142) continue;
      if (!coastal && x < -14 && z < -14) continue;
      if (!coastal && x > 14 && z < -14) continue;

      const y = this.heightAt(x, z);
      if (!coastal && y < 1.2) continue;

      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.4) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const s = coastal ? 1.8 + rand() * 2.2 : 0.9 + rand() * 1.4;
      rockPositions.push({
        x,
        y,
        z,
        sx: s * (0.9 + rand() * 0.35),
        sy: s * (0.65 + rand() * 0.35),
        sz: s * (0.9 + rand() * 0.35),
        ry: rand() * Math.PI * 2,
        tint: new THREE.Color().setScalar(0.55 + rand() * 0.28),
      });
    }

    this.rockCountMax = rockPositions.length;
    const rockGeo = this.regGeo(new THREE.DodecahedronGeometry(1.0, 0));
    this.rocksMesh = new THREE.InstancedMesh(rockGeo, this.materials.rock, this.rockCountMax);
    this.rocksMesh.castShadow = true;
    this.rocksMesh.receiveShadow = true;

    rockPositions.forEach((rp, idx) => {
      dummy.position.set(rp.x, rp.y + rp.sy * 0.38, rp.z);
      dummy.rotation.set(rand() * 0.4, rp.ry, rand() * 0.4);
      dummy.scale.set(rp.sx, rp.sy, rp.sz);
      dummy.updateMatrix();
      this.rocksMesh.setMatrixAt(idx, dummy.matrix);
      this.rocksMesh.setColorAt(idx, rp.tint);

      if (rp.sx > 1.1) {
        this.physics.addStaticBox(rp.x, rp.y + rp.sy * 0.4, rp.z, rp.sx * 0.72, rp.sy * 0.65, rp.sz * 0.72, rp.ry);
        this.obstacles.push({ x: rp.x, z: rp.z, radius: Math.max(rp.sx, rp.sz) * 0.85 });
      }
    });

    this.finalizeInstancedMesh(this.rocksMesh);
    this.group.add(this.rocksMesh);

    // Offshore Arctic Icebergs & Glacial Spires
    const iceCount = 24;
    this.extraRockCountMax = iceCount;
    const iceGeo = this.regGeo(new THREE.OctahedronGeometry(1.0, 0));
    this.extraRocksMesh = new THREE.InstancedMesh(iceGeo, this.materials.glacierIce, iceCount);
    this.extraRocksMesh.castShadow = true;
    this.extraRocksMesh.receiveShadow = true;

    for (let i = 0; i < iceCount; i++) {
      const a = (i / iceCount) * Math.PI * 2 + rand() * 0.2;
      const dist = 178 + rand() * 48;
      const ix = Math.cos(a) * dist;
      const iz = Math.sin(a) * dist;
      const sx = 3.5 + rand() * 5.0;
      const sy = 2.4 + rand() * 4.5;
      dummy.position.set(ix, sy * 0.35 - 0.4, iz);
      dummy.rotation.set(rand() * 0.2, rand() * Math.PI, rand() * 0.2);
      dummy.scale.set(sx, sy, sx * (0.8 + rand() * 0.4));
      dummy.updateMatrix();
      this.extraRocksMesh.setMatrixAt(i, dummy.matrix);
    }
    this.finalizeInstancedMesh(this.extraRocksMesh);
    this.group.add(this.extraRocksMesh);
  }

  private finalizeInstancedMesh(mesh: THREE.InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  private registerRotatedBox(
    originX: number,
    worldY: number,
    originZ: number,
    localX: number,
    localZ: number,
    hx: number,
    hy: number,
    hz: number,
    rotY: number,
  ): void {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const wx = originX + localX * cos + localZ * sin;
    const wz = originZ - localX * sin + localZ * cos;
    this.physics.addStaticBox(wx, worldY, wz, hx, hy, hz, rotY);
  }

  public update(dt: number): void {
    for (let i = 0; i < this.multiStoryBuildings.length; i++) {
      this.multiStoryBuildings[i].update(dt);
    }
  }

  public resetInteractive(): void {
    for (let i = 0; i < this.multiStoryBuildings.length; i++) {
      this.multiStoryBuildings[i].resetDoors();
    }
  }

  public getMultiStoryLootSpawns(): Array<{ x: number; y: number; z: number }> {
    const out: Array<{ x: number; y: number; z: number }> = [];
    for (const b of this.multiStoryBuildings) {
      out.push(...b.getIndoorLootSpawns());
    }
    return out;
  }

  public applyQuality(quality: 'low' | 'medium' | 'high'): void {
    const treeRatio = quality === 'low' ? 0.55 : quality === 'medium' ? 0.8 : 1.0;
    const rockRatio = quality === 'low' ? 0.6 : quality === 'medium' ? 0.85 : 1.0;
    const activeTrees = Math.max(1, Math.floor(this.treeCountMax * treeRatio));
    const activeRocks = Math.max(1, Math.floor(this.rockCountMax * rockRatio));
    this.treeTrunks.count = activeTrees;
    this.treeCanopyLower.count = activeTrees;
    this.treeCanopyUpper.count = activeTrees;
    this.rocksMesh.count = activeRocks;
    if (this.extraRocksMesh) {
      this.extraRocksMesh.count = Math.max(1, Math.floor(this.extraRockCountMax * rockRatio));
    }
  }

  public dispose(): void {
    this.multiStoryBuildings.forEach((b) => b.dispose());
    this.multiStoryBuildings.length = 0;
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
  }
}
