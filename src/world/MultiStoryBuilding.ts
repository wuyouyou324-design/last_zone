import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  BuildingDoorQuery,
  BuildingFloorTag,
  BuildingNavNode,
  NavigableBuilding,
} from '../ai/BuildingNav';
import { PhysicsWorld } from '../core/PhysicsWorld';
import { DoorPrompt } from '../types/game';
import { MaterialLibrary } from './Materials';

interface LocalWallRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  doorId?: string;
}

interface DoorInstance {
  id: string;
  label: string;
  floor: 1 | 2;
  hingeGroup: THREE.Group;
  hingeLocalX: number;
  hingeLocalY: number;
  hingeLocalZ: number;
  centerWorldX: number;
  centerWorldY: number;
  centerWorldZ: number;
  baseRotY: number;
  openAngleRad: number;
  halfWidth: number;
  halfHeight: number;
  localZAxisAligned: boolean;
  isOpen: boolean;
  currentAngle: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

const FLOOR_1_TOP = 0.24;
const STORY_HEIGHT = 3.7;
const FLOOR_2_TOP = FLOOR_1_TOP + STORY_HEIGHT; // 3.94
const SLAB_THICKNESS = 0.3;
const WALL_HEIGHT = 3.4;
const WALL_THICK = 0.36;
const DOOR_HEIGHT = 2.52;
const DOOR_WIDTH = 2.2;
const WIN_SILL = 0.96;
const WIN_TOP = 2.46;

const STAIR_CENTER_X = 5.95;
const STAIR_WIDTH = 3.1;
const STAIR_Z_BOTTOM = 2.6;
const STAIR_Z_TOP = -4.0;
const STAIR_STEPS = 16;

export class MultiStoryBuilding implements NavigableBuilding {
  public readonly id: string;
  public readonly group = new THREE.Group();
  public readonly originX: number;
  public readonly originY: number;
  public readonly originZ: number;
  public readonly width = 16.0;
  public readonly depth = 14.0;
  public readonly rotY: number;
  public readonly navNodes: BuildingNavNode[] = [];

  private geometries: THREE.BufferGeometry[] = [];
  private doors: DoorInstance[] = [];
  private doorMap = new Map<string, DoorInstance>();
  private walls1F: LocalWallRect[] = [];
  private walls2F: LocalWallRect[] = [];
  private exploreWaypoints: Array<{ x: number; y: number; z: number; floor: BuildingFloorTag }> = [];
  private indoorLootPoints: Array<{ x: number; y: number; z: number }> = [];
  private exteriorCorners: Array<{ x: number; z: number }> = [];

  constructor(
    id: string,
    originX: number,
    originY: number,
    originZ: number,
    rotY: number,
    private materials: MaterialLibrary,
    private physics: PhysicsWorld,
  ) {
    this.id = id;
    this.originX = originX;
    this.originY = originY;
    this.originZ = originZ;
    this.rotY = rotY;

    this.group.position.set(originX, originY, originZ);
    this.group.rotation.y = rotY;

    this.buildStructure();
    this.buildStaircase();
    this.buildDoors();
    this.buildNavGraph();
    this.buildMetadata();
  }

  private regGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private localToWorld(lx: number, ly: number, lz: number): { x: number; y: number; z: number } {
    const cos = Math.cos(this.rotY);
    const sin = Math.sin(this.rotY);
    return {
      x: this.originX + lx * cos + lz * sin,
      y: this.originY + ly,
      z: this.originZ - lx * sin + lz * cos,
    };
  }

  private worldToLocal(wx: number, wz: number): { lx: number; lz: number } {
    const dx = wx - this.originX;
    const dz = wz - this.originZ;
    const cos = Math.cos(-this.rotY);
    const sin = Math.sin(-this.rotY);
    return {
      lx: dx * cos + dz * sin,
      lz: -dx * sin + dz * cos,
    };
  }

  private addVisualBox(
    w: number,
    h: number,
    d: number,
    lx: number,
    ly: number,
    lz: number,
    mat: THREE.Material,
    castShadow = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.regGeo(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(lx, ly, lz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private addStaticPart(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    mat: THREE.Material,
    castShadow = true,
  ): void {
    const w = maxX - minX;
    const h = maxY - minY;
    const d = maxZ - minZ;
    if (w <= 0.01 || h <= 0.01 || d <= 0.01) return;

    const lx = (minX + maxX) * 0.5;
    const ly = (minY + maxY) * 0.5;
    const lz = (minZ + maxZ) * 0.5;

    this.addVisualBox(w, h, d, lx, ly, lz, mat, castShadow);
    const worldPos = this.localToWorld(lx, ly, lz);
    this.physics.addStaticBox(
      worldPos.x,
      worldPos.y,
      worldPos.z,
      w * 0.5,
      h * 0.5,
      d * 0.5,
      this.rotY,
    );
  }

  private addWallSegmentAlongX(
    floor: 1 | 2,
    zCenter: number,
    minX: number,
    maxX: number,
    wallMat: THREE.Material,
    openings: Array<{ minX: number; maxX: number; minH: number; maxH: number }> = [],
  ): void {
    const baseY = floor === 1 ? FLOOR_1_TOP : FLOOR_2_TOP;
    const topY = baseY + WALL_HEIGHT;
    const z0 = zCenter - WALL_THICK * 0.5;
    const z1 = zCenter + WALL_THICK * 0.5;
    const sorted = [...openings].sort((a, b) => a.minX - b.minX);
    let cursorX = minX;

    for (const op of sorted) {
      if (op.minX > cursorX + 0.01) {
        this.addStaticPart(cursorX, op.minX, baseY, topY, z0, z1, wallMat);
        this.pushBotWall(floor, cursorX, op.minX, z0, z1);
      }
      if (op.minH > 0.02) {
        this.addStaticPart(op.minX, op.maxX, baseY, baseY + op.minH, z0, z1, wallMat);
        this.pushBotWall(floor, op.minX, op.maxX, z0, z1);
      }
      if (baseY + op.maxH < topY - 0.02) {
        this.addStaticPart(op.minX, op.maxX, baseY + op.maxH, topY, z0, z1, wallMat);
      }
      // Window / doorframe trim
      if (op.minH > 0.05) {
        this.addVisualBox(
          op.maxX - op.minX + 0.14,
          0.1,
          WALL_THICK + 0.12,
          (op.minX + op.maxX) * 0.5,
          baseY + op.minH + 0.04,
          zCenter,
          this.materials.concreteDark,
          false,
        );
      }
      cursorX = op.maxX;
    }

    if (cursorX < maxX - 0.01) {
      this.addStaticPart(cursorX, maxX, baseY, topY, z0, z1, wallMat);
      this.pushBotWall(floor, cursorX, maxX, z0, z1);
    }
  }

  private addWallSegmentAlongZ(
    floor: 1 | 2,
    xCenter: number,
    minZ: number,
    maxZ: number,
    wallMat: THREE.Material,
    openings: Array<{ minZ: number; maxZ: number; minH: number; maxH: number }> = [],
  ): void {
    const baseY = floor === 1 ? FLOOR_1_TOP : FLOOR_2_TOP;
    const topY = baseY + WALL_HEIGHT;
    const x0 = xCenter - WALL_THICK * 0.5;
    const x1 = xCenter + WALL_THICK * 0.5;
    const sorted = [...openings].sort((a, b) => a.minZ - b.minZ);
    let cursorZ = minZ;

    for (const op of sorted) {
      if (op.minZ > cursorZ + 0.01) {
        this.addStaticPart(x0, x1, baseY, topY, cursorZ, op.minZ, wallMat);
        this.pushBotWall(floor, x0, x1, cursorZ, op.minZ);
      }
      if (op.minH > 0.02) {
        this.addStaticPart(x0, x1, baseY, baseY + op.minH, op.minZ, op.maxZ, wallMat);
        this.pushBotWall(floor, x0, x1, op.minZ, op.maxZ);
      }
      if (baseY + op.maxH < topY - 0.02) {
        this.addStaticPart(x0, x1, baseY + op.maxH, topY, op.minZ, op.maxZ, wallMat);
      }
      if (op.minH > 0.05) {
        this.addVisualBox(
          WALL_THICK + 0.12,
          0.1,
          op.maxZ - op.minZ + 0.14,
          xCenter,
          baseY + op.minH + 0.04,
          (op.minZ + op.maxZ) * 0.5,
          this.materials.concreteDark,
          false,
        );
      }
      cursorZ = op.maxZ;
    }

    if (cursorZ < maxZ - 0.01) {
      this.addStaticPart(x0, x1, baseY, topY, cursorZ, maxZ, wallMat);
      this.pushBotWall(floor, x0, x1, cursorZ, maxZ);
    }
  }

  private pushBotWall(
    floor: 1 | 2,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    doorId?: string,
  ): void {
    const rect: LocalWallRect = { minX, maxX, minZ, maxZ, doorId };
    if (floor === 1) {
      this.walls1F.push(rect);
    } else {
      this.walls2F.push(rect);
    }
  }

  private buildStructure(): void {
    const extMat = this.materials.brickWarm;
    const intMat = this.materials.concreteWall;
    const slabMat = this.materials.concreteDark;

    // 1. Foundation slab (1F floor)
    this.addStaticPart(-8.3, 8.3, -0.4, FLOOR_1_TOP, -7.3, 7.3, slabMat, false);

    // Gentle sloped entry ramps at front (+Z) and rear (-Z) entrances
    this.addEntryApron(0, 7.65, 3.2, 1.35, 1);
    this.addEntryApron(0, -7.65, 3.2, 1.35, -1);

    // 2. First Floor Exterior Walls (y = 0.24 .. 3.64)
    // South wall (z = +6.82) with central door (-1.1..+1.1) and 2 tactical windows
    this.addWallSegmentAlongX(1, 6.82, -8.0, 8.0, extMat, [
      { minX: -6.2, maxX: -3.4, minH: WIN_SILL, maxH: WIN_TOP },
      { minX: -1.1, maxX: 1.1, minH: 0, maxH: DOOR_HEIGHT },
      { minX: 3.2, maxX: 6.0, minH: WIN_SILL, maxH: WIN_TOP },
    ]);
    // North wall (z = -6.82) with rear door (-1.1..+1.1) and 2 windows
    this.addWallSegmentAlongX(1, -6.82, -8.0, 8.0, extMat, [
      { minX: -6.2, maxX: -3.4, minH: WIN_SILL, maxH: WIN_TOP },
      { minX: -1.1, maxX: 1.1, minH: 0, maxH: DOOR_HEIGHT },
      { minX: 3.2, maxX: 6.0, minH: WIN_SILL, maxH: WIN_TOP },
    ]);
    // West exterior wall (x = -7.82) with SW & NW room windows
    this.addWallSegmentAlongZ(1, -7.82, -6.64, 6.64, extMat, [
      { minZ: -4.6, maxZ: -2.0, minH: WIN_SILL, maxH: WIN_TOP },
      { minZ: 2.0, maxZ: 4.6, minH: WIN_SILL, maxH: WIN_TOP },
    ]);
    // East exterior wall (x = +7.82) with stair vestibule window
    this.addWallSegmentAlongZ(1, 7.82, -6.64, 6.64, extMat, [
      { minZ: 4.3, maxZ: 5.8, minH: 1.1, maxH: WIN_TOP },
    ]);

    // 3. First Floor Interior Partitions
    // West Hall partition (x = -2.2): SW door (+2.1..+4.3) & NW archway (-4.5..-2.3)
    this.addWallSegmentAlongZ(1, -2.2, -6.64, 6.64, intMat, [
      { minZ: -4.5, maxZ: -2.3, minH: 0, maxH: 2.65 },
      { minZ: 2.1, maxZ: 4.3, minH: 0, maxH: DOOR_HEIGHT },
    ]);
    // West Wing room divider (z = 0.0, x = -7.64..-2.38) with archway
    this.addWallSegmentAlongX(1, 0.0, -7.64, -2.38, intMat, [
      { minX: -6.0, maxX: -4.0, minH: 0, maxH: 2.65 },
    ]);
    // East Stairwell partition (x = +4.2): wide stair entry archway (+3.0..+6.2)
    this.addWallSegmentAlongZ(1, 4.2, -6.64, 6.64, intMat, [
      { minZ: 3.0, maxZ: 6.2, minH: 0, maxH: 2.95 },
    ]);
    // Under-stair closed service bulkhead (x = +4.38..+7.64, z = -6.64..-2.2) sits strictly beneath the upper stair span
    this.addStaticPart(4.38, 7.64, FLOOR_1_TOP, FLOOR_1_TOP + 2.0, -6.64, -2.2, intMat);

    // 4. Second Floor Slab (y = 3.64 .. 3.94), leaving stairwell cutout at x:+4.2..+7.64, z:-4.0..+3.2
    const f2Bottom = FLOOR_2_TOP - SLAB_THICKNESS;
    // West & Center deck
    this.addStaticPart(-8.0, 4.2, f2Bottom, FLOOR_2_TOP, -7.0, 7.0, slabMat);
    // North-East Stair Landing
    this.addStaticPart(4.2, 8.0, f2Bottom, FLOOR_2_TOP, -7.0, -4.0, slabMat);
    // South-East Overlook Balcony deck
    this.addStaticPart(4.2, 8.0, f2Bottom, FLOOR_2_TOP, 3.2, 7.0, slabMat);

    // Exterior mid-floor architectural band trim
    this.addVisualBox(16.24, 0.34, 14.24, 0, f2Bottom + 0.15, 0, slabMat, false);

    // 5. Second Floor Exterior Walls (y = 3.94 .. 7.34)
    this.addWallSegmentAlongX(2, 6.82, -8.0, 8.0, extMat, [
      { minX: -6.2, maxX: -3.4, minH: WIN_SILL, maxH: WIN_TOP },
      { minX: -1.3, maxX: 1.3, minH: WIN_SILL, maxH: WIN_TOP },
      { minX: 4.6, maxX: 6.8, minH: WIN_SILL, maxH: WIN_TOP },
    ]);
    this.addWallSegmentAlongX(2, -6.82, -8.0, 8.0, extMat, [
      { minX: -6.2, maxX: -3.4, minH: WIN_SILL, maxH: WIN_TOP },
      { minX: -1.3, maxX: 1.3, minH: WIN_SILL, maxH: WIN_TOP },
      { minX: 4.8, maxX: 6.8, minH: WIN_SILL, maxH: WIN_TOP },
    ]);
    this.addWallSegmentAlongZ(2, -7.82, -6.64, 6.64, extMat, [
      { minZ: -4.6, maxZ: -2.0, minH: WIN_SILL, maxH: WIN_TOP },
      { minZ: 2.0, maxZ: 4.6, minH: WIN_SILL, maxH: WIN_TOP },
    ]);
    this.addWallSegmentAlongZ(2, 7.82, -6.64, 6.64, extMat, [
      { minZ: -5.8, maxZ: -4.2, minH: WIN_SILL, maxH: WIN_TOP },
      { minZ: 4.2, maxZ: 6.0, minH: WIN_SILL, maxH: WIN_TOP },
    ]);

    // 6. Second Floor Interior Partitions
    // 2F West Hall partition (x = -2.2): 2F SW room door (+2.1..+4.3) & NW archway (-4.5..-2.3)
    this.addWallSegmentAlongZ(2, -2.2, -6.64, 6.64, intMat, [
      { minZ: -4.5, maxZ: -2.3, minH: 0, maxH: 2.65 },
      { minZ: 2.1, maxZ: 4.3, minH: 0, maxH: DOOR_HEIGHT },
    ]);
    // 2F West Wing divider (z = 0.0)
    this.addWallSegmentAlongX(2, 0.0, -7.64, -2.38, intMat, [
      { minX: -6.0, maxX: -4.0, minH: 0, maxH: 2.65 },
    ]);
    // 2F East Stairwell partition (x = +2.2): North Landing doorway (-6.2..-4.0), SE Overlook doorway (+4.0..+6.2), middle window
    this.addWallSegmentAlongZ(2, 2.2, -6.64, 6.64, intMat, [
      { minZ: -6.2, maxZ: -4.0, minH: 0, maxH: 2.75 },
      { minZ: -1.4, maxZ: 1.4, minH: 1.05, maxH: WIN_TOP },
      { minZ: 4.0, maxZ: 6.2, minH: 0, maxH: 2.75 },
    ]);

    // 2F Stairwell safety guardrails around stairwell hole
    const railTop = FLOOR_2_TOP + 1.05;
    this.addStaticPart(4.12, 4.32, FLOOR_2_TOP, railTop, -4.0, 3.36, this.materials.gunMetal);
    this.pushBotWall(2, 4.1, 4.34, -4.0, 3.36);
    this.addStaticPart(4.12, 7.64, FLOOR_2_TOP, railTop, 3.16, 3.36, this.materials.gunMetal);
    this.pushBotWall(2, 4.1, 7.64, 3.14, 3.38);

    // 7. Roof Slab & Parapet Trim (y = 7.34 .. 7.78)
    const roofBase = FLOOR_2_TOP + WALL_HEIGHT; // 7.34
    const roofTop = roofBase + 0.42;
    this.addStaticPart(-8.35, 8.35, roofBase, roofTop, -7.35, 7.35, slabMat);

    // Parapet rim & tactical rooftop HVAC / antenna details
    this.addStaticPart(-8.35, 8.35, roofTop, roofTop + 0.55, 7.05, 7.35, slabMat);
    this.addStaticPart(-8.35, 8.35, roofTop, roofTop + 0.55, -7.35, -7.05, slabMat);
    this.addStaticPart(-8.35, -8.05, roofTop, roofTop + 0.55, -7.05, 7.05, slabMat);
    this.addStaticPart(8.05, 8.35, roofTop, roofTop + 0.55, -7.05, 7.05, slabMat);

    this.addVisualBox(2.4, 1.05, 1.8, -3.5, roofTop + 0.52, -2.5, this.materials.corrugatedSteel);
    this.addVisualBox(0.35, 2.4, 0.35, 4.6, roofTop + 1.2, 3.2, this.materials.gunMetal);
  }

  private addEntryApron(lx: number, lz: number, width: number, length: number, dirZ: 1 | -1): void {
    const slope = Math.atan2(FLOOR_1_TOP, length);
    const rotX = dirZ > 0 ? slope : -slope;
    const cos = Math.cos(this.rotY);
    const sin = Math.sin(this.rotY);
    const wx = this.originX + lx * cos + lz * sin;
    const wz = this.originZ - lx * sin + lz * cos;
    const wy = this.originY + FLOOR_1_TOP * 0.5 - 0.14;

    const mesh = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(width, 0.24, Math.hypot(length, FLOOR_1_TOP))),
      this.materials.concreteDark,
    );
    mesh.position.set(lx, FLOOR_1_TOP * 0.5 - 0.12, lz);
    mesh.rotation.x = rotX;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    this.physics.addStaticBoxEuler(
      wx,
      wy,
      wz,
      width * 0.5,
      0.14,
      Math.hypot(length, FLOOR_1_TOP) * 0.5,
      rotX,
      this.rotY,
      0,
    );
  }

  private buildStaircase(): void {
    const run = STAIR_Z_BOTTOM - STAIR_Z_TOP; // 6.6m
    const rise = FLOOR_2_TOP - FLOOR_1_TOP; // 3.70m
    const slopeAngle = Math.atan2(rise, run); // +0.5108 rad (climbs toward -Z)
    const rampLen = Math.hypot(run, rise);
    const rampHalfThick = 0.16;

    // 1. Visual stepped treads along the ramp
    const stepRun = run / STAIR_STEPS;
    const stepRise = rise / STAIR_STEPS;
    for (let i = 0; i < STAIR_STEPS; i++) {
      const treadZ = STAIR_Z_BOTTOM - (i + 0.5) * stepRun;
      const treadTopY = FLOOR_1_TOP + (i + 1) * stepRise;
      this.addVisualBox(
        STAIR_WIDTH - 0.18,
        stepRise,
        stepRun + 0.04,
        STAIR_CENTER_X,
        treadTopY - stepRise * 0.5,
        treadZ,
        this.materials.woodPlank,
      );
    }

    // 2. Side structural steel stringers + handrail along inner edge
    const midY = (FLOOR_1_TOP + FLOOR_2_TOP) * 0.5 - 0.12;
    const midZ = (STAIR_Z_BOTTOM + STAIR_Z_TOP) * 0.5;
    [-1, 1].forEach((side) => {
      const stringer = new THREE.Mesh(
        this.regGeo(new THREE.BoxGeometry(0.14, 0.34, rampLen)),
        this.materials.gunMetal,
      );
      stringer.position.set(STAIR_CENTER_X + side * (STAIR_WIDTH * 0.5 - 0.04), midY, midZ);
      stringer.rotation.x = slopeAngle;
      stringer.castShadow = true;
      stringer.receiveShadow = true;
      this.group.add(stringer);
    });

    const handrail = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(0.1, 0.1, rampLen)),
      this.materials.hazardTrim,
    );
    handrail.position.set(STAIR_CENTER_X - STAIR_WIDTH * 0.5 + 0.06, midY + 1.05, midZ);
    handrail.rotation.x = slopeAngle;
    this.group.add(handrail);

    // 3. Smooth inclined Rapier ramp collider aligned so top surface hits (zBottom, F1) and (zTop, F2)
    const localRampCy = (FLOOR_1_TOP + FLOOR_2_TOP) * 0.5 - rampHalfThick * Math.cos(slopeAngle);
    const localRampCz = (STAIR_Z_BOTTOM + STAIR_Z_TOP) * 0.5 - rampHalfThick * Math.sin(slopeAngle);
    const worldRamp = this.localToWorld(STAIR_CENTER_X, localRampCy, localRampCz);

    this.physics.addStaticBoxEuler(
      worldRamp.x,
      worldRamp.y,
      worldRamp.z,
      STAIR_WIDTH * 0.5,
      rampHalfThick,
      rampLen * 0.5,
      slopeAngle,
      this.rotY,
      0,
    );
  }

  private createHingedDoor(spec: {
    id: string;
    label: string;
    floor: 1 | 2;
    hingeLocalX: number;
    hingeLocalY: number;
    hingeLocalZ: number;
    baseRotY: number;
    openAngleRad: number;
    localZAxisAligned: boolean;
  }): void {
    const leafW = DOOR_WIDTH - 0.12;
    const leafH = DOOR_HEIGHT - 0.06;
    const leafT = 0.1;

    const hinge = new THREE.Group();
    hinge.position.set(spec.hingeLocalX, spec.hingeLocalY, spec.hingeLocalZ);
    hinge.rotation.y = spec.baseRotY;

    // Leaf geometry offset +leafW*0.5 along hinge local +X
    const leafMesh = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(leafW, leafH, leafT)),
      this.materials.woodPlank,
    );
    leafMesh.position.set(leafW * 0.5, leafH * 0.5, 0);
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    hinge.add(leafMesh);

    const frameBar = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(leafW - 0.24, 0.12, leafT + 0.03)),
      this.materials.gunMetal,
    );
    frameBar.position.set(leafW * 0.5, leafH * 0.62, 0);
    hinge.add(frameBar);

    const handle = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(0.18, 0.08, leafT + 0.1)),
      this.materials.hazardTrim,
    );
    handle.position.set(leafW - 0.24, leafH * 0.45, 0);
    hinge.add(handle);

    this.group.add(hinge);

    const centerLocal = this.computeDoorCenterWorld(
      spec.hingeLocalX,
      spec.hingeLocalY,
      spec.hingeLocalZ,
      spec.baseRotY,
      leafW * 0.5,
      leafH * 0.5,
    );
    const { body, collider } = this.physics.registerKinematicWorldBox(
      centerLocal.x,
      centerLocal.y,
      centerLocal.z,
      leafW * 0.5,
      leafH * 0.5,
      leafT * 0.55,
      this.rotY + spec.baseRotY,
    );

    const closedCenter = this.computeDoorCenterWorld(
      spec.hingeLocalX,
      spec.hingeLocalY,
      spec.hingeLocalZ,
      spec.baseRotY,
      leafW * 0.5,
      leafH * 0.5,
    );

    const door: DoorInstance = {
      id: spec.id,
      label: spec.label,
      floor: spec.floor,
      hingeGroup: hinge,
      hingeLocalX: spec.hingeLocalX,
      hingeLocalY: spec.hingeLocalY,
      hingeLocalZ: spec.hingeLocalZ,
      centerWorldX: closedCenter.x,
      centerWorldY: closedCenter.y,
      centerWorldZ: closedCenter.z,
      baseRotY: spec.baseRotY,
      openAngleRad: spec.openAngleRad,
      halfWidth: leafW * 0.5,
      halfHeight: leafH * 0.5,
      localZAxisAligned: spec.localZAxisAligned,
      isOpen: false,
      currentAngle: 0,
      body,
      collider,
    };

    this.doors.push(door);
    this.doorMap.set(door.id, door);

    // Register door footprint in AI horizontal wall table (checked only when blocking)
    if (spec.localZAxisAligned) {
      this.pushBotWall(
        spec.floor,
        spec.hingeLocalX - 0.14,
        spec.hingeLocalX + 0.14,
        spec.hingeLocalZ,
        spec.hingeLocalZ + DOOR_WIDTH,
        spec.id,
      );
    } else {
      this.pushBotWall(
        spec.floor,
        spec.hingeLocalX,
        spec.hingeLocalX + DOOR_WIDTH,
        spec.hingeLocalZ - 0.14,
        spec.hingeLocalZ + 0.14,
        spec.id,
      );
    }
  }

  private computeDoorCenterWorld(
    hingeLocalX: number,
    hingeLocalY: number,
    hingeLocalZ: number,
    totalLocalYaw: number,
    halfW: number,
    halfH: number,
  ): { x: number; y: number; z: number } {
    const lx = hingeLocalX + Math.cos(totalLocalYaw) * halfW;
    const lz = hingeLocalZ - Math.sin(totalLocalYaw) * halfW;
    return this.localToWorld(lx, hingeLocalY + halfH, lz);
  }

  private buildDoors(): void {
    // 1. South Main Entrance (hinge at x=-1.04, swings inward -Z via +86 deg)
    this.createHingedDoor({
      id: `${this.id}-door-south`,
      label: 'South Entrance Door',
      floor: 1,
      hingeLocalX: -1.04,
      hingeLocalY: FLOOR_1_TOP,
      hingeLocalZ: 6.82,
      baseRotY: 0,
      openAngleRad: Math.PI * 0.48,
      localZAxisAligned: false,
    });

    // 2. North Rear Entrance (hinge at x=-1.04, swings inward +Z via -86 deg)
    this.createHingedDoor({
      id: `${this.id}-door-north`,
      label: 'North Exit Door',
      floor: 1,
      hingeLocalX: -1.04,
      hingeLocalY: FLOOR_1_TOP,
      hingeLocalZ: -6.82,
      baseRotY: 0,
      openAngleRad: -Math.PI * 0.48,
      localZAxisAligned: false,
    });

    // 3. 1F SW Tactical Room Door (hinge at x=-2.2, z=+2.16, leaf along +Z via baseRotY=-PI/2, swings West via -86 deg)
    this.createHingedDoor({
      id: `${this.id}-door-1f-sw`,
      label: '1F Briefing Door',
      floor: 1,
      hingeLocalX: -2.2,
      hingeLocalY: FLOOR_1_TOP,
      hingeLocalZ: 2.16,
      baseRotY: -Math.PI * 0.5,
      openAngleRad: -Math.PI * 0.48,
      localZAxisAligned: true,
    });

    // 4. 2F SW Observation Room Door
    this.createHingedDoor({
      id: `${this.id}-door-2f-sw`,
      label: '2F Command Door',
      floor: 2,
      hingeLocalX: -2.2,
      hingeLocalY: FLOOR_2_TOP,
      hingeLocalZ: 2.16,
      baseRotY: -Math.PI * 0.5,
      openAngleRad: -Math.PI * 0.48,
      localZAxisAligned: true,
    });
  }

  private buildNavGraph(): void {
    const f1 = FLOOR_1_TOP;
    const f2 = FLOOR_2_TOP;
    const midY = (f1 + f2) * 0.5;

    const specs: Array<{
      id: string;
      lx: number;
      ly: number;
      lz: number;
      floor: BuildingFloorTag;
      kind: 'outdoor' | 'door' | 'room' | 'stair';
      doorId?: string;
      neighbors: string[];
    }> = [
      {
        id: 'ext_south',
        lx: 0,
        ly: 0.0,
        lz: 9.2,
        floor: 0,
        kind: 'outdoor',
        neighbors: ['door_south'],
      },
      {
        id: 'ext_north',
        lx: 0,
        ly: 0.0,
        lz: -9.2,
        floor: 0,
        kind: 'outdoor',
        neighbors: ['door_north'],
      },
      {
        id: 'door_south',
        lx: 0,
        ly: f1,
        lz: 6.82,
        floor: 1,
        kind: 'door',
        doorId: `${this.id}-door-south`,
        neighbors: ['ext_south', '1f_hall_s'],
      },
      {
        id: 'door_north',
        lx: 0,
        ly: f1,
        lz: -6.82,
        floor: 1,
        kind: 'door',
        doorId: `${this.id}-door-north`,
        neighbors: ['ext_north', '1f_hall_n'],
      },
      {
        id: '1f_hall_s',
        lx: 0,
        ly: f1,
        lz: 4.4,
        floor: 1,
        kind: 'room',
        neighbors: ['door_south', '1f_hall_c', '1f_sw_door', 'stair_entry'],
      },
      {
        id: '1f_hall_c',
        lx: 0,
        ly: f1,
        lz: 0.0,
        floor: 1,
        kind: 'room',
        neighbors: ['1f_hall_s', '1f_hall_n'],
      },
      {
        id: '1f_hall_n',
        lx: 0,
        ly: f1,
        lz: -3.4,
        floor: 1,
        kind: 'room',
        neighbors: ['door_north', '1f_hall_c', '1f_nw_room'],
      },
      {
        id: '1f_sw_door',
        lx: -2.2,
        ly: f1,
        lz: 3.2,
        floor: 1,
        kind: 'door',
        doorId: `${this.id}-door-1f-sw`,
        neighbors: ['1f_hall_s', '1f_sw_room'],
      },
      {
        id: '1f_sw_room',
        lx: -5.0,
        ly: f1,
        lz: 3.2,
        floor: 1,
        kind: 'room',
        neighbors: ['1f_sw_door', '1f_nw_room'],
      },
      {
        id: '1f_nw_room',
        lx: -5.0,
        ly: f1,
        lz: -3.4,
        floor: 1,
        kind: 'room',
        neighbors: ['1f_sw_room', '1f_hall_n'],
      },
      {
        id: 'stair_entry',
        lx: 3.2,
        ly: f1,
        lz: 4.6,
        floor: 1,
        kind: 'room',
        neighbors: ['1f_hall_s', 'stair_vestibule'],
      },
      {
        id: 'stair_vestibule',
        lx: STAIR_CENTER_X,
        ly: f1,
        lz: 4.6,
        floor: 1,
        kind: 'room',
        neighbors: ['stair_entry', 'stair_bot'],
      },
      {
        id: 'stair_bot',
        lx: STAIR_CENTER_X,
        ly: f1,
        lz: STAIR_Z_BOTTOM,
        floor: 1,
        kind: 'stair',
        neighbors: ['stair_vestibule', 'stair_mid'],
      },
      {
        id: 'stair_mid',
        lx: STAIR_CENTER_X,
        ly: midY,
        lz: (STAIR_Z_BOTTOM + STAIR_Z_TOP) * 0.5,
        floor: 'stairs',
        kind: 'stair',
        neighbors: ['stair_bot', 'stair_top'],
      },
      {
        id: 'stair_top',
        lx: STAIR_CENTER_X,
        ly: f2,
        lz: STAIR_Z_TOP - 0.15,
        floor: 2,
        kind: 'stair',
        neighbors: ['stair_mid', '2f_landing'],
      },
      {
        id: '2f_landing',
        lx: STAIR_CENTER_X,
        ly: f2,
        lz: -5.2,
        floor: 2,
        kind: 'room',
        neighbors: ['stair_top', '2f_hall_n'],
      },
      {
        id: '2f_hall_n',
        lx: 0,
        ly: f2,
        lz: -5.0,
        floor: 2,
        kind: 'room',
        neighbors: ['2f_landing', '2f_hall_c', '2f_nw_room'],
      },
      {
        id: '2f_hall_c',
        lx: 0,
        ly: f2,
        lz: -1.0,
        floor: 2,
        kind: 'room',
        neighbors: ['2f_hall_n', '2f_hall_s'],
      },
      {
        id: '2f_hall_s',
        lx: 0,
        ly: f2,
        lz: 4.5,
        floor: 2,
        kind: 'room',
        neighbors: ['2f_hall_c', '2f_sw_door', '2f_se_overlook'],
      },
      {
        id: '2f_sw_door',
        lx: -2.2,
        ly: f2,
        lz: 3.2,
        floor: 2,
        kind: 'door',
        doorId: `${this.id}-door-2f-sw`,
        neighbors: ['2f_hall_s', '2f_sw_room'],
      },
      {
        id: '2f_sw_room',
        lx: -5.0,
        ly: f2,
        lz: 3.2,
        floor: 2,
        kind: 'room',
        neighbors: ['2f_sw_door', '2f_nw_room'],
      },
      {
        id: '2f_nw_room',
        lx: -5.0,
        ly: f2,
        lz: -3.4,
        floor: 2,
        kind: 'room',
        neighbors: ['2f_sw_room', '2f_hall_n'],
      },
      {
        id: '2f_se_overlook',
        lx: 5.6,
        ly: f2,
        lz: 5.1,
        floor: 2,
        kind: 'room',
        neighbors: ['2f_hall_s'],
      },
    ];

    for (const s of specs) {
      const wp = this.localToWorld(s.lx, s.ly, s.lz);
      this.navNodes.push({
        id: s.id,
        x: wp.x,
        y: wp.y,
        z: wp.z,
        floor: s.floor,
        kind: s.kind,
        doorId: s.doorId,
        neighbors: s.neighbors,
      });
    }
  }

  private buildMetadata(): void {
    const wpSpecs: Array<{ lx: number; ly: number; lz: number; floor: BuildingFloorTag }> = [
      { lx: -5.2, ly: FLOOR_1_TOP, lz: 3.4, floor: 1 },
      { lx: -5.2, ly: FLOOR_1_TOP, lz: -3.6, floor: 1 },
      { lx: 0.0, ly: FLOOR_1_TOP, lz: 0.4, floor: 1 },
      { lx: -5.2, ly: FLOOR_2_TOP, lz: 3.4, floor: 2 },
      { lx: -5.2, ly: FLOOR_2_TOP, lz: -3.4, floor: 2 },
      { lx: 5.6, ly: FLOOR_2_TOP, lz: 5.1, floor: 2 },
      { lx: 0.0, ly: FLOOR_2_TOP, lz: 4.5, floor: 2 },
    ];
    for (const wp of wpSpecs) {
      const world = this.localToWorld(wp.lx, wp.ly, wp.lz);
      this.exploreWaypoints.push({ ...world, floor: wp.floor });
    }

    const lootLocal: Array<[number, number, number]> = [
      [-5.2, FLOOR_1_TOP, 3.4],
      [-5.2, FLOOR_1_TOP, -3.6],
      [-5.2, FLOOR_2_TOP, 3.4],
      [5.8, FLOOR_2_TOP, 5.1],
    ];
    for (const [lx, ly, lz] of lootLocal) {
      this.indoorLootPoints.push(this.localToWorld(lx, ly, lz));
    }

    const cornerOffX = this.width * 0.5 + 2.4;
    const cornerOffZ = this.depth * 0.5 + 2.4;
    const corners: Array<[number, number]> = [
      [-cornerOffX, -cornerOffZ],
      [cornerOffX, -cornerOffZ],
      [-cornerOffX, cornerOffZ],
      [cornerOffX, cornerOffZ],
    ];
    for (const [cx, cz] of corners) {
      const w = this.localToWorld(cx, 0, cz);
      this.exteriorCorners.push({ x: w.x, z: w.z });
    }
  }

  public containsXZ(wx: number, wz: number, margin = 0): boolean {
    const { lx, lz } = this.worldToLocal(wx, wz);
    return (
      Math.abs(lx) <= this.width * 0.5 + margin &&
      Math.abs(lz) <= this.depth * 0.5 + margin
    );
  }

  public getWalkableHeight(wx: number, currentY: number, wz: number): number | null {
    const { lx, lz } = this.worldToLocal(wx, wz);
    if (Math.abs(lx) > this.width * 0.5 + 1.5 || Math.abs(lz) > this.depth * 0.5 + 1.6) {
      return null;
    }

    const relY = currentY - this.originY;

    // Exterior ramps
    if (Math.abs(lx) <= 1.7 && lz > 6.95 && lz <= 8.45) {
      const t = 1 - Math.max(0, Math.min(1, (lz - 7.0) / 1.35));
      return this.originY + FLOOR_1_TOP * t;
    }
    if (Math.abs(lx) <= 1.7 && lz < -6.95 && lz >= -8.45) {
      const t = 1 - Math.max(0, Math.min(1, (-lz - 7.0) / 1.35));
      return this.originY + FLOOR_1_TOP * t;
    }

    if (Math.abs(lx) > this.width * 0.5 + 0.1 || Math.abs(lz) > this.depth * 0.5 + 0.1) {
      return null;
    }

    // Staircase linear ramp surface when inside stair XY corridor
    if (
      lx >= STAIR_CENTER_X - STAIR_WIDTH * 0.5 - 0.15 &&
      lx <= STAIR_CENTER_X + STAIR_WIDTH * 0.5 + 0.15 &&
      lz <= STAIR_Z_BOTTOM + 0.2 &&
      lz >= STAIR_Z_TOP - 0.2
    ) {
      const t = Math.max(0, Math.min(1, (STAIR_Z_BOTTOM - lz) / (STAIR_Z_BOTTOM - STAIR_Z_TOP)));
      return this.originY + FLOOR_1_TOP + t * (FLOOR_2_TOP - FLOOR_1_TOP);
    }

    // 2F floor surface when closer to 2F (and not inside stairwell cutout)
    if (relY >= 2.15) {
      const inStairHole = lx >= 4.2 && lx <= 7.8 && lz > -4.0 && lz < 3.2;
      if (!inStairHole) {
        return this.originY + FLOOR_2_TOP;
      }
    }

    return this.originY + FLOOR_1_TOP;
  }

  public resolveBotCollision(
    wx: number,
    wy: number,
    wz: number,
    radius = 0.44,
  ): { x: number; z: number; blockedDoorId: string | null } {
    let { lx, lz } = this.worldToLocal(wx, wz);
    const relY = wy - this.originY;
    let blockedDoorId: string | null = null;

    // On staircase slope: constrain gently between East exterior wall and inner stringer
    const onStairSlope =
      lx >= 4.0 &&
      lx <= 7.8 &&
      lz >= STAIR_Z_TOP - 0.1 &&
      lz <= STAIR_Z_BOTTOM + 0.1 &&
      relY >= 0.20 &&
      relY <= FLOOR_2_TOP + 0.35;

    if (onStairSlope) {
      const minStairX = 4.2 + radius;
      const maxStairX = 7.64 - radius;
      if (lx < minStairX) lx = minStairX;
      if (lx > maxStairX) lx = maxStairX;
      const world = this.localToWorld(lx, relY, lz);
      return { x: world.x, z: world.z, blockedDoorId: null };
    }

    const table = relY >= 2.2 ? this.walls2F : this.walls1F;
    for (let i = 0; i < table.length; i++) {
      const rect = table[i];
      if (rect.doorId) {
        const door = this.doorMap.get(rect.doorId);
        if (!door || door.isOpen || Math.abs(door.currentAngle) > Math.abs(door.openAngleRad) * 0.55) {
          continue;
        }
      }

      const closestX = Math.max(rect.minX, Math.min(lx, rect.maxX));
      const closestZ = Math.max(rect.minZ, Math.min(lz, rect.maxZ));
      const dx = lx - closestX;
      const dz = lz - closestZ;
      const dSq = dx * dx + dz * dz;

      if (dSq < radius * radius) {
        if (rect.doorId) {
          blockedDoorId = rect.doorId;
        }
        if (dSq > 1e-6) {
          const d = Math.sqrt(dSq);
          const push = radius - d;
          lx += (dx / d) * push;
          lz += (dz / d) * push;
        } else {
          // Center inside rect: push along shallowest axis
          const penLeft = Math.abs(lx - rect.minX);
          const penRight = Math.abs(rect.maxX - lx);
          const penTop = Math.abs(lz - rect.minZ);
          const penBot = Math.abs(rect.maxZ - lz);
          const minPen = Math.min(penLeft, penRight, penTop, penBot);
          if (minPen === penLeft) lx = rect.minX - radius;
          else if (minPen === penRight) lx = rect.maxX + radius;
          else if (minPen === penTop) lz = rect.minZ - radius;
          else lz = rect.maxZ + radius;
        }
      }
    }

    const world = this.localToWorld(lx, relY, lz);
    return { x: world.x, z: world.z, blockedDoorId };
  }

  public update(dt: number): void {
    for (let i = 0; i < this.doors.length; i++) {
      const door = this.doors[i];
      const targetAngle = door.isOpen ? door.openAngleRad : 0;
      const diff = targetAngle - door.currentAngle;
      if (Math.abs(diff) > 0.002) {
        const step = 1 - Math.exp(-10.5 * dt);
        door.currentAngle += diff * step;
      } else {
        door.currentAngle = targetAngle;
      }

      const localYaw = door.baseRotY + door.currentAngle;
      door.hingeGroup.rotation.y = localYaw;

      const worldCenter = this.computeDoorCenterWorld(
        door.hingeLocalX,
        door.hingeLocalY,
        door.hingeLocalZ,
        localYaw,
        door.halfWidth,
        door.halfHeight,
      );
      this.physics.setKinematicWorldBoxTransform(
        door.body,
        worldCenter.x,
        worldCenter.y,
        worldCenter.z,
        this.rotY + localYaw,
      );
    }
  }

  public resetDoors(): void {
    for (let i = 0; i < this.doors.length; i++) {
      const door = this.doors[i];
      door.isOpen = false;
      door.currentAngle = 0;
      door.hingeGroup.rotation.y = door.baseRotY;
      const worldCenter = this.computeDoorCenterWorld(
        door.hingeLocalX,
        door.hingeLocalY,
        door.hingeLocalZ,
        door.baseRotY,
        door.halfWidth,
        door.halfHeight,
      );
      this.physics.setKinematicWorldBoxTransform(
        door.body,
        worldCenter.x,
        worldCenter.y,
        worldCenter.z,
        this.rotY + door.baseRotY,
      );
    }
  }

  public getDoorById(doorId: string): BuildingDoorQuery | null {
    const d = this.doorMap.get(doorId);
    if (!d) return null;
    return {
      id: d.id,
      label: d.label,
      x: d.centerWorldX,
      y: d.centerWorldY - d.halfHeight,
      z: d.centerWorldZ,
      isOpen: d.isOpen,
      isBlocking: !d.isOpen || Math.abs(d.currentAngle) < Math.abs(d.openAngleRad) * 0.55,
    };
  }

  public setDoorOpen(doorId: string, open: boolean): boolean {
    const d = this.doorMap.get(doorId);
    if (!d || d.isOpen === open) return false;
    d.isOpen = open;
    return true;
  }

  public toggleDoor(doorId: string): { toggled: boolean; isOpen: boolean; x: number; y: number; z: number } | null {
    const d = this.doorMap.get(doorId);
    if (!d) return null;
    d.isOpen = !d.isOpen;
    return {
      toggled: true,
      isOpen: d.isOpen,
      x: d.centerWorldX,
      y: d.centerWorldY,
      z: d.centerWorldZ,
    };
  }

  public findNearestDoor(
    wx: number,
    feetY: number,
    wz: number,
    maxDist = 2.75,
  ): { prompt: DoorPrompt; distSq: number } | null {
    let best: DoorInstance | null = null;
    let bestDistSq = maxDist * maxDist;

    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      const doorFloorY = d.centerWorldY - d.halfHeight;
      if (Math.abs(feetY - doorFloorY) > 1.85) continue;
      const dx = d.centerWorldX - wx;
      const dz = d.centerWorldZ - wz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = d;
      }
    }

    if (!best) return null;
    return {
      prompt: {
        id: best.id,
        label: best.label,
        isOpen: best.isOpen,
      },
      distSq: bestDistSq,
    };
  }

  public findBlockingDoorNear(
    wx: number,
    wy: number,
    wz: number,
    radius = 2.3,
  ): BuildingDoorQuery | null {
    let best: DoorInstance | null = null;
    let bestDistSq = radius * radius;
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      if (d.isOpen) continue;
      const doorFloorY = d.centerWorldY - d.halfHeight;
      if (Math.abs(wy - doorFloorY) > 1.85) continue;
      const dx = d.centerWorldX - wx;
      const dz = d.centerWorldZ - wz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = d;
      }
    }
    return best ? this.getDoorById(best.id) : null;
  }

  public getExploreWaypoints(): ReadonlyArray<{ x: number; y: number; z: number; floor: BuildingFloorTag }> {
    return this.exploreWaypoints;
  }

  public getIndoorLootSpawns(): ReadonlyArray<{ x: number; y: number; z: number }> {
    return this.indoorLootPoints;
  }

  public getExteriorCorners(): ReadonlyArray<{ x: number; z: number }> {
    return this.exteriorCorners;
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.doors = [];
    this.doorMap.clear();
  }
}
