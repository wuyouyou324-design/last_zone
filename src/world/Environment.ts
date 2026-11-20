import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { MaterialLibrary } from './Materials';
import { getTerrainHeight } from './Terrain';

export interface ObstacleBounds {
  x: number;
  z: number;
  radius: number;
}

export class EnvironmentSystem {
  public readonly group = new THREE.Group();
  public readonly obstacles: ObstacleBounds[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private treeTrunks!: THREE.InstancedMesh;
  private treeCanopyLower!: THREE.InstancedMesh;
  private treeCanopyUpper!: THREE.InstancedMesh;
  private rocksMesh!: THREE.InstancedMesh;
  private treeCountMax = 0;
  private rockCountMax = 0;

  constructor(
    private materials: MaterialLibrary,
    private physics: PhysicsWorld,
  ) {
    this.buildUrbanZone();
    this.buildIndustrialZone();
    this.buildMountainZone();
    this.buildForestStructures();
    this.buildInstancedVegetationAndRocks();
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

  private buildUrbanZone(): void {
    // Urban Quadrant: NW (x: -115..-18, z: -115..-18)
    // Paved cross-streets raised 0.03m above flat plateau y=2.0
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

    // 6 Multi-part composite urban buildings with enterable lower bays / porticoes
    const buildings: Array<{
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      rotY: number;
      brick: boolean;
    }> = [
      { x: -42, z: -42, w: 14, d: 12, h: 8.5, rotY: 0, brick: true },
      { x: -86, z: -44, w: 16, d: 12, h: 10.5, rotY: Math.PI / 2, brick: false },
      { x: -44, z: -88, w: 15, d: 13, h: 7.5, rotY: Math.PI, brick: false },
      { x: -88, z: -88, w: 14, d: 14, h: 12.0, rotY: 0, brick: true },
      { x: -28, z: -102, w: 11, d: 10, h: 6.2, rotY: -Math.PI / 2, brick: true },
      { x: -108, z: -64, w: 12, d: 15, h: 8.0, rotY: 0, brick: false },
    ];

    buildings.forEach((b) => {
      const groundY = getTerrainHeight(b.x, b.z);
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, groundY, b.z);
      bGroup.rotation.y = b.rotY;

      const wallMat = b.brick ? this.materials.brickWarm : this.materials.concreteWall;
      const trimMat = this.materials.concreteDark;

      // 1. Concrete foundation plinth
      this.addBoxPart(bGroup, b.w + 0.8, 0.4, b.d + 0.8, 0, 0.2, 0, trimMat, false);

      // 2. Left & right structural walls + back wall (open front doorway for cover/entry)
      const wallThick = 0.65;
      const doorWidth = 3.4;
      const frontSideW = (b.w - doorWidth) * 0.5;

      // Back wall
      this.addBoxPart(bGroup, b.w, b.h, wallThick, 0, b.h * 0.5 + 0.4, -b.d * 0.5 + wallThick * 0.5, wallMat);
      // Left wall
      this.addBoxPart(bGroup, wallThick, b.h, b.d, -b.w * 0.5 + wallThick * 0.5, b.h * 0.5 + 0.4, 0, wallMat);
      // Right wall
      this.addBoxPart(bGroup, wallThick, b.h, b.d, b.w * 0.5 - wallThick * 0.5, b.h * 0.5 + 0.4, 0, wallMat);
      // Front left & right walls + lintel above doorway
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

      // 3. Roof slab + parapet rim + rooftop HVAC unit
      this.addBoxPart(bGroup, b.w + 0.6, 0.5, b.d + 0.6, 0, b.h + 0.65, 0, trimMat);
      this.addBoxPart(bGroup, 2.2, 1.1, 1.8, -b.w * 0.22, b.h + 1.45, -b.d * 0.15, this.materials.corrugatedSteel);
      this.addBoxPart(bGroup, 0.4, 2.0, 0.4, b.w * 0.28, b.h + 1.9, b.d * 0.2, this.materials.gunMetal);

      // 4. Exterior window trim accents
      this.addBoxPart(bGroup, b.w + 0.15, 0.28, 0.2, 0, b.h * 0.58, b.d * 0.5 + 0.05, trimMat, false);

      this.group.add(bGroup);

      // Register exact Rapier wall colliders in world space
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, 0, -b.d * 0.5 + wallThick * 0.5, b.w * 0.5, b.h * 0.5, wallThick * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, -b.w * 0.5 + wallThick * 0.5, 0, wallThick * 0.5, b.h * 0.5, b.d * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, b.w * 0.5 - wallThick * 0.5, 0, wallThick * 0.5, b.h * 0.5, b.d * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, -b.w * 0.5 + frontSideW * 0.5, b.d * 0.5 - wallThick * 0.5, frontSideW * 0.5, b.h * 0.5, wallThick * 0.5, b.rotY);
      this.registerRotatedBox(b.x, groundY + b.h * 0.5 + 0.4, b.z, b.w * 0.5 - frontSideW * 0.5, b.d * 0.5 - wallThick * 0.5, frontSideW * 0.5, b.h * 0.5, wallThick * 0.5, b.rotY);

      this.obstacles.push({ x: b.x, z: b.z, radius: Math.max(b.w, b.d) * 0.6 });
    });

    // Concrete street barriers & streetlamps along Urban avenues
    const barriers: Array<[number, number, number]> = [
      [-57, -48, 0],
      [-71, -55, 0.25],
      [-56, -78, -0.15],
      [-80, -70, Math.PI / 2],
      [-48, -58, Math.PI / 2],
      [-94, -58, Math.PI / 2],
    ];
    barriers.forEach(([bx, bz, rot]) => {
      const y = getTerrainHeight(bx, bz);
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
    // Industrial Quadrant: NE (x: 22..120, z: -115..-22)
    const yardPad = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(92, 0.08, 92)),
      this.materials.concreteDark,
    );
    yardPad.position.set(68, 2.22, -68);
    yardPad.receiveShadow = true;
    this.group.add(yardPad);

    // 2 Large Corrugated Steel Warehouses (open ends for walk-through firefights)
    const warehouses = [
      { x: 52, z: -48, w: 18, d: 24, h: 8.2, rotY: 0 },
      { x: 92, z: -82, w: 16, d: 22, h: 7.5, rotY: Math.PI / 2 },
    ];
    warehouses.forEach((w) => {
      const y = getTerrainHeight(w.x, w.z);
      const grp = new THREE.Group();
      grp.position.set(w.x, y, w.z);
      grp.rotation.y = w.rotY;

      // Plinth + side walls + pitched/stepped industrial roof + yellow hazard girders
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

    // 4 Fuel Storage Silos + Pipe Bridge
    const silos: Array<[number, number, number, number]> = [
      [88, -42, 4.2, 9.5],
      [100, -42, 4.2, 9.5],
      [88, -55, 3.6, 8.0],
      [100, -55, 3.6, 8.0],
    ];
    silos.forEach(([sx, sz, r, h]) => {
      const y = getTerrainHeight(sx, sz);
      const grp = new THREE.Group();
      grp.position.set(sx, y, sz);

      const base = new THREE.Mesh(
        this.regGeo(new THREE.CylinderGeometry(r + 0.35, r + 0.35, 0.6, 16)),
        this.materials.concreteDark,
      );
      base.position.y = 0.3;
      base.receiveShadow = true;
      grp.add(base);

      const tank = new THREE.Mesh(
        this.regGeo(new THREE.CylinderGeometry(r, r, h, 16)),
        this.materials.corrugatedSteel,
      );
      tank.position.y = h * 0.5 + 0.6;
      tank.castShadow = true;
      tank.receiveShadow = true;
      grp.add(tank);

      const ring = new THREE.Mesh(
        this.regGeo(new THREE.CylinderGeometry(r + 0.14, r + 0.14, 0.55, 16)),
        this.materials.hazardTrim,
      );
      ring.position.y = h * 0.78;
      grp.add(ring);

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

    // Overhead pipe connecting silo pairs
    const pipeY = getTerrainHeight(94, -42) + 7.5;
    const pipe = new THREE.Mesh(
      this.regGeo(new THREE.CylinderGeometry(0.45, 0.45, 13, 10)),
      this.materials.industrialAccent,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(94, pipeY, -42);
    pipe.castShadow = true;
    this.group.add(pipe);

    // 6 Shipping Containers (tactical cover yard)
    const containers = [
      { x: 46, z: -84, rot: 0.1, mat: this.materials.containerOlive },
      { x: 56, z: -90, rot: -0.2, mat: this.materials.containerRust },
      { x: 64, z: -76, rot: Math.PI / 2, mat: this.materials.containerSlate },
      { x: 44, z: -96, rot: 0, mat: this.materials.containerSlate },
      { x: 75, z: -98, rot: 0.35, mat: this.materials.containerOlive },
      { x: 108, z: -66, rot: Math.PI / 2, mat: this.materials.containerRust },
    ];
    containers.forEach((c) => {
      const y = getTerrainHeight(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rot;
      // 3-part container: hull + top frame + corner steel posts
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
    // Mountain Summit Radar Outpost at (76, 76)
    const ox = 76;
    const oz = 76;
    const oy = getTerrainHeight(ox, oz);

    const tower = new THREE.Group();
    tower.position.set(ox, oy, oz);

    // Concrete pad
    this.addBoxPart(tower, 7.6, 0.6, 7.6, 0, 0.2, 0, this.materials.concreteDark, false);
    // 4 steel support columns
    const legOffsets = [-2.6, 2.6];
    legOffsets.forEach((lx) => {
      legOffsets.forEach((lz) => {
        this.addBoxPart(tower, 0.45, 5.4, 0.45, lx, 2.7, lz, this.materials.industrialAccent);
        this.physics.addStaticBox(ox + lx, oy + 2.7, oz + lz, 0.28, 2.7, 0.28);
      });
    });
    // Observation deck + roof canopy + radar mast
    this.addBoxPart(tower, 6.6, 0.35, 6.6, 0, 5.4, 0, this.materials.woodPlank);
    this.addBoxPart(tower, 6.6, 0.9, 0.2, 0, 6.0, 3.2, this.materials.gunMetal);
    this.addBoxPart(tower, 6.6, 0.9, 0.2, 0, 6.0, -3.2, this.materials.gunMetal);
    this.addBoxPart(tower, 0.2, 0.9, 6.6, -3.2, 6.0, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 0.2, 0.9, 6.6, 3.2, 6.0, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 5.2, 0.3, 5.2, 0, 8.2, 0, this.materials.corrugatedSteel);
    this.addBoxPart(tower, 0.35, 2.8, 0.35, 0, 9.6, 0, this.materials.gunMetal);
    this.addBoxPart(tower, 2.2, 1.1, 0.3, 0, 10.7, 0, this.materials.hazardTrim);

    // Ramp stairs on -X side so players can walk up to the observation deck
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

    // Low stone bunker walls near ridge flanks
    const bunkers: Array<[number, number, number]> = [
      [56, 56, 0.7],
      [96, 62, -0.5],
      [62, 98, 0.2],
    ];
    bunkers.forEach(([bx, bz, rot]) => {
      const y = getTerrainHeight(bx, bz);
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
    // 2 Rustic Wooden Ranger Cabins in Forest Zone (SW: x < -20, z > 20)
    const cabins = [
      { x: -48, z: 54, rotY: 0.4 },
      { x: -88, z: 86, rotY: -0.6 },
    ];
    cabins.forEach((c) => {
      const y = getTerrainHeight(c.x, c.z);
      const grp = new THREE.Group();
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = c.rotY;

      const w = 8.4;
      const d = 7.4;
      const h = 3.6;

      // Foundation + walls with wide doorway + pitched wood roof + porch posts
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
    // Deterministic pseudo-random placement
    let seed = 4219;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const treePositions: Array<{ x: number; y: number; z: number; s: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 240 && treePositions.length < 130; i++) {
      // Concentrate heavily in Forest SW, plus scattered border pines in Mountain/edges
      const inForest = i < 165;
      const x = inForest ? -14 - rand() * 124 : (rand() - 0.5) * 260;
      const z = inForest ? 14 + rand() * 124 : (rand() - 0.5) * 260;
      const dist = Math.hypot(x, z);
      if (dist > 142) continue;
      // Keep Urban & Industrial pads clear
      if (x < -12 && z < -12) continue;
      if (x > 12 && z < -12) continue;

      const y = getTerrainHeight(x, z);
      if (y < 1.2 || y > 14.5) continue;

      let blocked = false;
      for (const obs of this.obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 2.2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const scale = 0.85 + rand() * 0.34; // +-15%+ organic scale variation
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

      // Trunk collider
      this.physics.addStaticCylinder(tp.x, tp.y + 1.5, tp.z, 1.5, 0.34 * tp.s);
    });

    this.treeTrunks.instanceMatrix.needsUpdate = true;
    this.treeCanopyLower.instanceMatrix.needsUpdate = true;
    this.treeCanopyUpper.instanceMatrix.needsUpdate = true;
    if (this.treeCanopyLower.instanceColor) this.treeCanopyLower.instanceColor.needsUpdate = true;
    if (this.treeCanopyUpper.instanceColor) this.treeCanopyUpper.instanceColor.needsUpdate = true;
    this.treeTrunks.computeBoundingSphere();
    this.treeCanopyLower.computeBoundingSphere();
    this.treeCanopyUpper.computeBoundingSphere();

    this.group.add(this.treeTrunks, this.treeCanopyLower, this.treeCanopyUpper);

    // Instanced Boulders & Coastal Rocks
    const rockPositions: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 120 && rockPositions.length < 75; i++) {
      const coastal = i < 28;
      const angle = (i / 28) * Math.PI * 2 + rand() * 0.18;
      const x = coastal ? Math.cos(angle) * (146 + rand() * 14) : (rand() - 0.5) * 265;
      const z = coastal ? Math.sin(angle) * (146 + rand() * 14) : (rand() - 0.5) * 265;
      if (!coastal && Math.hypot(x, z) > 142) continue;
      if (!coastal && x < -14 && z < -14) continue;
      if (!coastal && x > 14 && z < -14) continue;

      const y = getTerrainHeight(x, z);
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

    this.rocksMesh.instanceMatrix.needsUpdate = true;
    if (this.rocksMesh.instanceColor) this.rocksMesh.instanceColor.needsUpdate = true;
    this.rocksMesh.computeBoundingSphere();
    this.group.add(this.rocksMesh);
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

  public applyQuality(quality: 'low' | 'medium' | 'high'): void {
    const treeRatio = quality === 'low' ? 0.55 : quality === 'medium' ? 0.8 : 1.0;
    const rockRatio = quality === 'low' ? 0.6 : quality === 'medium' ? 0.85 : 1.0;
    const activeTrees = Math.max(1, Math.floor(this.treeCountMax * treeRatio));
    const activeRocks = Math.max(1, Math.floor(this.rockCountMax * rockRatio));
    this.treeTrunks.count = activeTrees;
    this.treeCanopyLower.count = activeTrees;
    this.treeCanopyUpper.count = activeTrees;
    this.rocksMesh.count = activeRocks;
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
  }
}
