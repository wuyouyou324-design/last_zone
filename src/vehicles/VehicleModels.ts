import * as THREE from 'three';
import { VehicleType } from '../types/game';
import { VEHICLE_CATALOG, VehicleSpec } from './VehicleCatalog';

export interface WheelRig {
  steerPivot: THREE.Group;
  spinPivot: THREE.Group;
  radius: number;
  steerable: boolean;
}

export interface VehicleModelInstance {
  root: THREE.Group;
  chassisPivot: THREE.Group;
  detailGroup: THREE.Group;
  lodGroup: THREE.Group;
  wheels: WheelRig[];
  tailLightMat: THREE.MeshStandardMaterial;
  bodyPaintMat: THREE.MeshStandardMaterial;
  setLod(distSq: number): void;
  setBraking(braking: boolean): void;
  setDestroyedVisual(destroyed: boolean): void;
  dispose(): void;
}

export class VehicleModelsFactory {
  private sharedGeometries: THREE.BufferGeometry[] = [];
  private sharedMaterials: THREE.Material[] = [];

  private readonly rubberMat: THREE.MeshStandardMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly underbodyMat: THREE.MeshStandardMaterial;
  private readonly bumperMat: THREE.MeshStandardMaterial;
  private readonly chromeMat: THREE.MeshStandardMaterial;
  private readonly glassMat: THREE.MeshStandardMaterial;
  private readonly headlightMat: THREE.MeshStandardMaterial;
  private readonly canvasCanopyMat: THREE.MeshStandardMaterial;
  private readonly cargoWoodMat: THREE.MeshStandardMaterial;
  private readonly damagedCharMat: THREE.MeshStandardMaterial;

  constructor() {
    this.rubberMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x171a1e, roughness: 0.88, metalness: 0.08 }),
    );
    this.rimMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 0.32, metalness: 0.82 }),
    );
    this.underbodyMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.82, metalness: 0.35 }),
    );
    this.bumperMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: 0.62, metalness: 0.55 }),
    );
    this.chromeMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0xb7c0c9, roughness: 0.22, metalness: 0.9 }),
    );
    this.glassMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0x1a2c38,
        roughness: 0.12,
        metalness: 0.32,
        transparent: true,
        opacity: 0.78,
      }),
    );
    this.headlightMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff5d6,
        emissive: 0xffdf9e,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
    );
    this.canvasCanopyMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x6c6f59, roughness: 0.92, metalness: 0.04 }),
    );
    this.cargoWoodMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x5c4634, roughness: 0.88, metalness: 0.05 }),
    );
    this.damagedCharMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.96, metalness: 0.2 }),
    );
  }

  private regGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.sharedGeometries.push(geo);
    return geo;
  }

  private regMat<T extends THREE.Material>(mat: T): T {
    this.sharedMaterials.push(mat);
    return mat;
  }

  private createExtrudedSideProfile(
    points: Array<[number, number]>,
    width: number,
    bevel = 0.05,
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i][0], points[i][1]);
    }
    shape.closePath();

    const innerWidth = Math.max(0.2, width - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: innerWidth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      steps: 1,
    });
    geo.translate(0, 0, -innerWidth * 0.5);
    // Shape X -> local Z (-X is front -> -Z, +X is rear -> +Z)
    geo.rotateY(-Math.PI * 0.5);
    geo.computeVertexNormals();
    return this.regGeo(geo);
  }

  private buildWheel(radius: number, width: number, isSteerable: boolean): WheelRig {
    const steerPivot = new THREE.Group();
    const spinPivot = new THREE.Group();
    steerPivot.add(spinPivot);

    const tireGeo = this.regGeo(new THREE.CylinderGeometry(radius, radius, width, 16));
    tireGeo.rotateZ(Math.PI * 0.5);
    const tireMesh = new THREE.Mesh(tireGeo, this.rubberMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    spinPivot.add(tireMesh);

    const rimGeo = this.regGeo(
      new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width * 1.04, 12),
    );
    rimGeo.rotateZ(Math.PI * 0.5);
    const rimMesh = new THREE.Mesh(rimGeo, this.rimMat);
    spinPivot.add(rimMesh);

    const hubGeo = this.regGeo(
      new THREE.CylinderGeometry(radius * 0.24, radius * 0.24, width * 1.08, 8),
    );
    hubGeo.rotateZ(Math.PI * 0.5);
    const hubMesh = new THREE.Mesh(hubGeo, this.bumperMat);
    spinPivot.add(hubMesh);

    return { steerPivot, spinPivot, radius, steerable: isSteerable };
  }

  private addMesh(
    parent: THREE.Group,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    castShadow = true,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  public createVehicleInstance(type: VehicleType, tintOverrideHex?: number): VehicleModelInstance {
    const spec: VehicleSpec = VEHICLE_CATALOG[type];
    const root = new THREE.Group();
    root.name = `Vehicle_${type}`;

    const chassisPivot = new THREE.Group();
    root.add(chassisPivot);

    const detailGroup = new THREE.Group();
    const lodGroup = new THREE.Group();
    lodGroup.visible = false;
    chassisPivot.add(detailGroup, lodGroup);

    const paintColor = tintOverrideHex ?? spec.primaryColorHex;
    const bodyPaintMat = new THREE.MeshStandardMaterial({
      color: paintColor,
      roughness: type === 'sedan' ? 0.28 : 0.48,
      metalness: type === 'sedan' ? 0.52 : 0.28,
    });
    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      emissive: 0x991b1b,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });

    // Wheels mounted on root (or chassis under-suspension)
    const wheels: WheelRig[] = [];
    for (const w of spec.wheels) {
      const rig = this.buildWheel(w.radius, w.width, w.steerable);
      rig.steerPivot.position.set(w.offsetX, w.radius, w.offsetZ);
      root.add(rig.steerPivot);
      wheels.push(rig);
    }

    if (type === 'sedan') {
      this.buildSedanGeometry(detailGroup, lodGroup, spec, bodyPaintMat, tailLightMat);
    } else if (type === 'suv') {
      this.buildSuvGeometry(detailGroup, lodGroup, spec, bodyPaintMat, tailLightMat);
    } else if (type === 'pickup') {
      this.buildPickupGeometry(detailGroup, lodGroup, spec, bodyPaintMat, tailLightMat);
    } else {
      this.buildTruckGeometry(detailGroup, lodGroup, spec, bodyPaintMat, tailLightMat);
    }

    let isDestroyed = false;

    return {
      root,
      chassisPivot,
      detailGroup,
      lodGroup,
      wheels,
      tailLightMat,
      bodyPaintMat,
      setLod(distSq: number): void {
        const useLod = distSq > 68 * 68;
        detailGroup.visible = !useLod;
        lodGroup.visible = useLod;
      },
      setBraking(braking: boolean): void {
        tailLightMat.emissive.setHex(braking ? 0xff2222 : 0x991b1b);
        tailLightMat.emissiveIntensity = braking ? 2.1 : 0.45;
      },
      setDestroyedVisual: (destroyed: boolean): void => {
        if (isDestroyed === destroyed) return;
        isDestroyed = destroyed;
        if (destroyed) {
          bodyPaintMat.color.setHex(0x28292b);
          bodyPaintMat.roughness = 0.94;
          bodyPaintMat.metalness = 0.15;
          tailLightMat.emissiveIntensity = 0;
        }
      },
      dispose(): void {
        bodyPaintMat.dispose();
        tailLightMat.dispose();
      },
    };
  }

  private buildSedanGeometry(
    detail: THREE.Group,
    lod: THREE.Group,
    spec: VehicleSpec,
    paintMat: THREE.Material,
    tailMat: THREE.Material,
  ): void {
    // Lower sculpted body up to window beltline
    const lowerGeo = this.createExtrudedSideProfile(
      [
        [-2.2, 0.34],
        [-2.14, 0.72],
        [-1.12, 0.88],
        [1.56, 0.94],
        [2.16, 0.86],
        [2.22, 0.38],
      ],
      spec.width - 0.1,
      0.06,
    );
    this.addMesh(detail, lowerGeo, paintMat, 0, 0, 0);

    // Tinted wrap-around greenhouse (windshield, side & rear windows)
    const cabinGlassGeo = this.createExtrudedSideProfile(
      [
        [-1.08, 0.86],
        [-0.48, 1.36],
        [0.72, 1.38],
        [1.52, 0.92],
      ],
      spec.width - 0.22,
      0.03,
    );
    this.addMesh(detail, cabinGlassGeo, this.glassMat, 0, 0, 0, false);

    // Painted roof panel & C/B pillars
    const roofGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.28, 0.08, 1.26));
    this.addMesh(detail, roofGeo, paintMat, 0, 1.39, 0.12);
    const bPillarGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.19, 0.48, 0.11));
    this.addMesh(detail, bPillarGeo, this.bumperMat, 0, 1.12, 0.12, false);

    // Underbody tray & side skirts
    const trayGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.24, 0.16, spec.length - 0.4));
    this.addMesh(detail, trayGeo, this.underbodyMat, 0, 0.32, 0, false);

    // Bumpers & front grille
    const bumperGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.04, 0.22, 0.18));
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.36, -2.18);
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.38, 2.18);

    const grilleGeo = this.regGeo(new THREE.BoxGeometry(0.95, 0.22, 0.08));
    this.addMesh(detail, grilleGeo, this.chromeMat, 0, 0.56, -2.21, false);

    // Headlights & Taillights
    const lightGeo = this.regGeo(new THREE.BoxGeometry(0.32, 0.14, 0.08));
    this.addMesh(detail, lightGeo, this.headlightMat, -0.64, 0.62, -2.2, false);
    this.addMesh(detail, lightGeo, this.headlightMat, 0.64, 0.62, -2.2, false);
    this.addMesh(detail, lightGeo, tailMat, -0.64, 0.72, 2.21, false);
    this.addMesh(detail, lightGeo, tailMat, 0.64, 0.72, 2.21, false);

    // Side mirrors
    const mirrorGeo = this.regGeo(new THREE.BoxGeometry(0.18, 0.11, 0.14));
    this.addMesh(detail, mirrorGeo, this.bumperMat, -spec.width * 0.5 - 0.04, 0.94, -0.62, false);
    this.addMesh(detail, mirrorGeo, this.bumperMat, spec.width * 0.5 + 0.04, 0.94, -0.62, false);

    // LOD1 proxy
    const lodLower = this.regGeo(new THREE.BoxGeometry(spec.width, 0.56, spec.length));
    const lodTop = this.regGeo(new THREE.BoxGeometry(spec.width - 0.26, 0.5, 2.2));
    this.addMesh(lod, lodLower, paintMat, 0, 0.58, 0);
    this.addMesh(lod, lodTop, paintMat, 0, 1.1, 0.1);
  }

  private buildSuvGeometry(
    detail: THREE.Group,
    lod: THREE.Group,
    spec: VehicleSpec,
    paintMat: THREE.Material,
    tailMat: THREE.Material,
  ): void {
    // Lower rugged SUV chassis up to window beltline
    const lowerGeo = this.createExtrudedSideProfile(
      [
        [-2.28, 0.44],
        [-2.22, 0.98],
        [-1.12, 1.08],
        [2.22, 1.08],
        [2.28, 0.48],
      ],
      spec.width - 0.1,
      0.06,
    );
    this.addMesh(detail, lowerGeo, paintMat, 0, 0, 0);

    const chassisGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.26, 0.2, spec.length - 0.5));
    this.addMesh(detail, chassisGeo, this.underbodyMat, 0, 0.42, 0, false);

    // Tinted upper cabin greenhouse (front windshield, side windows, rear glass)
    const glassGeo = this.createExtrudedSideProfile(
      [
        [-1.08, 1.06],
        [-0.6, 1.72],
        [1.76, 1.74],
        [2.16, 1.08],
      ],
      spec.width - 0.22,
      0.03,
    );
    this.addMesh(detail, glassGeo, this.glassMat, 0, 0, 0, false);

    // Painted SUV roof & B/C pillars
    const roofGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.22, 0.09, 2.42));
    this.addMesh(detail, roofGeo, paintMat, 0, 1.74, 0.58);
    const pillarGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.19, 0.64, 0.14));
    this.addMesh(detail, pillarGeo, paintMat, 0, 1.4, 0.16);
    this.addMesh(detail, pillarGeo, paintMat, 0, 1.4, 1.24);

    // Bull bar, bumpers & roof rack
    const bumperGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.04, 0.26, 0.2));
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.48, -2.28);
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.48, 2.28);

    const bullBarGeo = this.regGeo(new THREE.BoxGeometry(1.18, 0.34, 0.12));
    this.addMesh(detail, bullBarGeo, this.bumperMat, 0, 0.72, -2.34);

    const grilleGeo = this.regGeo(new THREE.BoxGeometry(1.06, 0.26, 0.08));
    this.addMesh(detail, grilleGeo, this.bumperMat, 0, 0.84, -2.24, false);

    const rackGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.42, 0.08, 2.0));
    this.addMesh(detail, rackGeo, this.bumperMat, 0, 1.82, 0.58);

    // Spare wheel mounted on rear tailgate
    const spareTireGeo = this.regGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14));
    spareTireGeo.rotateX(Math.PI * 0.5);
    this.addMesh(detail, spareTireGeo, this.rubberMat, 0, 1.02, 2.34);
    const spareHubGeo = this.regGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.26, 10));
    spareHubGeo.rotateX(Math.PI * 0.5);
    this.addMesh(detail, spareHubGeo, this.rimMat, 0, 1.02, 2.34, false);

    // Side mirrors
    const mirrorGeo = this.regGeo(new THREE.BoxGeometry(0.2, 0.14, 0.14));
    this.addMesh(detail, mirrorGeo, this.bumperMat, -spec.width * 0.5 - 0.04, 1.14, -0.78, false);
    this.addMesh(detail, mirrorGeo, this.bumperMat, spec.width * 0.5 + 0.04, 1.14, -0.78, false);

    const lightGeo = this.regGeo(new THREE.BoxGeometry(0.3, 0.16, 0.08));
    this.addMesh(detail, lightGeo, this.headlightMat, -0.7, 0.84, -2.27, false);
    this.addMesh(detail, lightGeo, this.headlightMat, 0.7, 0.84, -2.27, false);
    this.addMesh(detail, lightGeo, tailMat, -0.76, 0.88, 2.28, false);
    this.addMesh(detail, lightGeo, tailMat, 0.76, 0.88, 2.28, false);

    // LOD1
    const lodLower = this.regGeo(new THREE.BoxGeometry(spec.width, 0.68, spec.length));
    const lodCab = this.regGeo(new THREE.BoxGeometry(spec.width - 0.22, 0.68, 2.7));
    this.addMesh(lod, lodLower, paintMat, 0, 0.74, 0);
    this.addMesh(lod, lodCab, paintMat, 0, 1.4, 0.45);
  }

  private buildPickupGeometry(
    detail: THREE.Group,
    lod: THREE.Group,
    spec: VehicleSpec,
    paintMat: THREE.Material,
    tailMat: THREE.Material,
  ): void {
    // Lower hood + cab base + bed lower body
    const lowerGeo = this.createExtrudedSideProfile(
      [
        [-2.5, 0.44],
        [-2.44, 1.02],
        [-1.18, 1.12],
        [2.48, 1.1],
        [2.5, 0.48],
      ],
      spec.width - 0.1,
      0.05,
    );
    this.addMesh(detail, lowerGeo, paintMat, 0, 0, 0);

    // Enclosed cab glass greenhouse
    const glassGeo = this.createExtrudedSideProfile(
      [
        [-1.14, 1.1],
        [-0.64, 1.76],
        [0.42, 1.76],
        [0.5, 1.1],
      ],
      spec.width - 0.22,
      0.03,
    );
    this.addMesh(detail, glassGeo, this.glassMat, 0, 0, 0, false);

    // Cab roof & rear/B pillars
    const cabRoofGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.22, 0.09, 1.12));
    this.addMesh(detail, cabRoofGeo, paintMat, 0, 1.77, -0.1);
    const rearWallGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.18, 0.66, 0.14));
    this.addMesh(detail, rearWallGeo, paintMat, 0, 1.44, 0.42);

    // Open rear cargo bed recess & walls
    const bedFloorGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.34, 0.1, 1.84));
    this.addMesh(detail, bedFloorGeo, this.cargoWoodMat, 0, 0.86, 1.54);

    const bedSideGeo = this.regGeo(new THREE.BoxGeometry(0.14, 0.38, 1.9));
    this.addMesh(detail, bedSideGeo, paintMat, -spec.width * 0.5 + 0.12, 1.2, 1.54);
    this.addMesh(detail, bedSideGeo, paintMat, spec.width * 0.5 - 0.12, 1.2, 1.54);
    const tailgateGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.24, 0.38, 0.14));
    this.addMesh(detail, tailgateGeo, paintMat, 0, 1.2, 2.42);

    // Roll bar & bumpers
    const rollBarGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.34, 0.58, 0.12));
    this.addMesh(detail, rollBarGeo, this.bumperMat, 0, 1.48, 0.62);

    const bumperGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.04, 0.26, 0.2));
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.46, -2.5);
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.46, 2.5);

    const lightGeo = this.regGeo(new THREE.BoxGeometry(0.32, 0.18, 0.08));
    this.addMesh(detail, lightGeo, this.headlightMat, -0.72, 0.84, -2.49, false);
    this.addMesh(detail, lightGeo, this.headlightMat, 0.72, 0.84, -2.49, false);
    this.addMesh(detail, lightGeo, tailMat, -0.78, 0.88, 2.5, false);
    this.addMesh(detail, lightGeo, tailMat, 0.78, 0.88, 2.5, false);

    // LOD1
    const lodLower = this.regGeo(new THREE.BoxGeometry(spec.width, 0.68, spec.length));
    const lodCab = this.regGeo(new THREE.BoxGeometry(spec.width - 0.2, 0.7, 1.35));
    this.addMesh(lod, lodLower, paintMat, 0, 0.74, 0);
    this.addMesh(lod, lodCab, paintMat, 0, 1.42, -0.2);
  }

  private buildTruckGeometry(
    detail: THREE.Group,
    lod: THREE.Group,
    spec: VehicleSpec,
    paintMat: THREE.Material,
    tailMat: THREE.Material,
  ): void {
    // Heavy steel chassis frame rails
    const frameGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.46, 0.28, spec.length - 0.3));
    this.addMesh(detail, frameGeo, this.underbodyMat, 0, 0.62, 0);

    // Lower armored cab nose & doors
    const cabLowerGeo = this.createExtrudedSideProfile(
      [
        [-3.32, 0.68],
        [-3.26, 1.56],
        [-2.74, 1.74],
        [-1.02, 1.74],
        [-1.02, 0.72],
      ],
      spec.width - 0.14,
      0.05,
    );
    this.addMesh(detail, cabLowerGeo, paintMat, 0, 0, 0);

    // Cab armored glass greenhouse
    const cabGlassGeo = this.createExtrudedSideProfile(
      [
        [-2.7, 1.72],
        [-2.36, 2.42],
        [-1.12, 2.44],
        [-1.08, 1.72],
      ],
      spec.width - 0.24,
      0.03,
    );
    this.addMesh(detail, cabGlassGeo, this.glassMat, 0, 0, 0, false);

    // Cab roof & steel rear bulkhead
    const cabRoofGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.2, 0.1, 1.3));
    this.addMesh(detail, cabRoofGeo, paintMat, 0, 2.46, -1.73);
    const bulkheadGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.18, 0.72, 0.18));
    this.addMesh(detail, bulkheadGeo, paintMat, 0, 2.08, -1.12);

    // Cargo bed + tactical canvas canopy hoops
    const bedGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.08, 0.65, 4.1));
    this.addMesh(detail, bedGeo, paintMat, 0, 1.08, 1.24);

    const canopyGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.18, 1.32, 3.98));
    this.addMesh(detail, canopyGeo, this.canvasCanopyMat, 0, 2.04, 1.24);

    const canopyTopGeo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.46, 0.18, 3.92));
    this.addMesh(detail, canopyTopGeo, this.canvasCanopyMat, 0, 2.75, 1.24);

    // Front reinforced bumper & radiator grill
    const bumperGeo = this.regGeo(new THREE.BoxGeometry(spec.width + 0.04, 0.34, 0.26));
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.62, -3.32);
    this.addMesh(detail, bumperGeo, this.bumperMat, 0, 0.62, 3.3);

    const grillGeo = this.regGeo(new THREE.BoxGeometry(1.28, 0.64, 0.1));
    this.addMesh(detail, grillGeo, this.bumperMat, 0, 1.18, -3.31, false);

    const lightGeo = this.regGeo(new THREE.BoxGeometry(0.32, 0.2, 0.1));
    this.addMesh(detail, lightGeo, this.headlightMat, -0.84, 0.94, -3.32, false);
    this.addMesh(detail, lightGeo, this.headlightMat, 0.84, 0.94, -3.32, false);
    this.addMesh(detail, lightGeo, tailMat, -0.9, 0.92, 3.32, false);
    this.addMesh(detail, lightGeo, tailMat, 0.9, 0.92, 3.32, false);

    // LOD1
    const lodCab = this.regGeo(new THREE.BoxGeometry(spec.width - 0.14, 1.8, 2.2));
    const lodCargo = this.regGeo(new THREE.BoxGeometry(spec.width - 0.1, 2.05, 4.1));
    this.addMesh(lod, lodCab, paintMat, 0, 1.56, -2.18);
    this.addMesh(lod, lodCargo, this.canvasCanopyMat, 0, 1.72, 1.24);
  }

  public dispose(): void {
    this.sharedGeometries.forEach((g) => g.dispose());
    this.sharedMaterials.forEach((m) => m.dispose());
    this.sharedGeometries = [];
    this.sharedMaterials = [];
  }
}
