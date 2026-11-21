import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Node FileReader shim required by GLTFExporter binary (.glb) export
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (ab) => {
          this.result = ab;
          if (this.onloadend) this.onloadend({ target: this });
          if (this.onload) this.onload({ target: this });
        },
        (err) => {
          if (this.onerror) this.onerror(err);
        },
      );
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (ab) => {
          const b64 = Buffer.from(ab).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
          if (this.onloadend) this.onloadend({ target: this });
          if (this.onload) this.onload({ target: this });
        },
        (err) => {
          if (this.onerror) this.onerror(err);
        },
      );
    }
  };
}

const OUT_DIR = path.resolve(process.cwd(), 'public/assets/characters');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Geometry Builders: Superellipse Lofting + Anatomical Limb/Torso Sculpting
// Character height: ~1.78m, bottom-center pivot at y=0, facing -Z
// ---------------------------------------------------------------------------

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Generates an organic lofted cross-section mesh from rings:
 * Each ring: { y, cx, cz, rx, rz, exp?: number }
 * exp=2 is ellipse, exp>2 is slightly squared/sculpted tactical profile.
 */
function buildLoftedMesh(rings, radialSegs, opts = {}) {
  const capBottom = opts.capBottom ?? true;
  const capTop = opts.capTop ?? true;
  const positions = [];
  const uvs = [];
  const indices = [];

  const nRings = rings.length;
  for (let i = 0; i < nRings; i++) {
    const r = rings[i];
    const v = nRings > 1 ? i / (nRings - 1) : 0;
    const exp = r.exp ?? 2.15;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const sx = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / exp);
      const sz = Math.sign(st) * Math.pow(Math.abs(st), 2 / exp);
      positions.push(r.cx + sx * r.rx, r.y, r.cz + sz * r.rz);
      uvs.push(u, v);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < nRings - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  if (capBottom && nRings > 0) {
    const rb = rings[0];
    const centerIdx = positions.length / 3;
    positions.push(rb.cx, rb.y, rb.cz);
    uvs.push(0.5, 0);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(centerIdx, j + 1, j);
    }
  }

  if (capTop && nRings > 0) {
    const rt = rings[nRings - 1];
    const base = (nRings - 1) * stride;
    const centerIdx = positions.length / 3;
    positions.push(rt.cx, rt.y, rt.cz);
    uvs.push(0.5, 1);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(centerIdx, base + j, base + j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an open or capped horizontal limb loft along X or Z or Y,
 * starting with vertical loft then transforming, or custom axis.
 */
function transformGeo(geo, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.compose(new THREE.Vector3(tx, ty, tz), q, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
}

function makeRoundedBoxGeo(w, h, d, segs = 2) {
  const g = new THREE.BoxGeometry(w, h, d, segs, segs, segs);
  const pos = g.attributes.position;
  const hw = w * 0.5;
  const hh = h * 0.5;
  const hd = d * 0.5;
  const bevel = Math.min(hw, hh, hd) * 0.28;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const ix = Math.max(-hw + bevel, Math.min(hw - bevel, x));
    const iy = Math.max(-hh + bevel, Math.min(hh - bevel, y));
    const iz = Math.max(-hd + bevel, Math.min(hd - bevel, z));
    const dx = x - ix;
    const dy = y - iy;
    const dz = z - iz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-5) {
      const k = bevel / Math.max(len, bevel);
      if (len > bevel * 0.999) {
        x = ix + dx * k;
        y = iy + dy * k;
        z = iz + dz * k;
      }
    }
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Skeleton Hierarchy (20 Bones + Weapon/Gear Sockets)
// ---------------------------------------------------------------------------

const BONE_ORDER = [
  'Root',       // 0
  'Pelvis',     // 1
  'Spine',      // 2
  'Chest',      // 3
  'Neck',       // 4
  'Head',       // 5
  'ShoulderL',  // 6
  'UpperArmL',  // 7
  'ForearmL',   // 8
  'HandL',      // 9
  'ShoulderR',  // 10
  'UpperArmR',  // 11
  'ForearmR',   // 12
  'HandR',      // 13
  'ThighL',     // 14
  'ShinL',      // 15
  'FootL',      // 16
  'ThighR',     // 17
  'ShinR',      // 18
  'FootR',      // 19
];

const BONE_INDEX = Object.fromEntries(BONE_ORDER.map((n, i) => [n, i]));

function createHumanoidSkeleton() {
  const bones = {};
  const make = (name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) parent.add(b);
    bones[name] = b;
    return b;
  };

  // World rest heights (feet at y=0):
  // Pelvis=0.95, Spine=1.10, Chest=1.28, Neck=1.48, Head=1.56
  // Shoulder=1.43 (±0.11), UpperArm=1.42 (±0.19), Forearm=1.14, Hand=0.88
  // Thigh=0.91 (±0.10), Shin=0.50, Foot=0.09
  const Root = make('Root', null, 0, 0, 0);
  const Pelvis = make('Pelvis', Root, 0, 0.95, 0);
  const Spine = make('Spine', Pelvis, 0, 0.15, 0);
  const Chest = make('Chest', Spine, 0, 0.18, 0);
  const Neck = make('Neck', Chest, 0, 0.20, 0);
  const Head = make('Head', Neck, 0, 0.08, 0);

  // Arms hanging naturally down (-Y) in bind pose
  const ShoulderL = make('ShoulderL', Chest, -0.11, 0.15, 0);
  const UpperArmL = make('UpperArmL', ShoulderL, -0.08, -0.01, 0);
  const ForearmL = make('ForearmL', UpperArmL, 0, -0.28, 0);
  const HandL = make('HandL', ForearmL, 0, -0.26, 0);

  const ShoulderR = make('ShoulderR', Chest, 0.11, 0.15, 0);
  const UpperArmR = make('UpperArmR', ShoulderR, 0.08, -0.01, 0);
  const ForearmR = make('ForearmR', UpperArmR, 0, -0.28, 0);
  const HandR = make('HandR', ForearmR, 0, -0.26, 0);

  const ThighL = make('ThighL', Pelvis, -0.10, -0.04, 0);
  const ShinL = make('ShinL', ThighL, 0, -0.41, 0);
  const FootL = make('FootL', ShinL, 0, -0.41, 0);

  const ThighR = make('ThighR', Pelvis, 0.10, -0.04, 0);
  const ShinR = make('ShinR', ThighR, 0, -0.41, 0);
  const FootR = make('FootR', ShinR, 0, -0.41, 0);

  // Named attachment sockets
  const rightWeaponSocket = new THREE.Object3D();
  rightWeaponSocket.name = 'RightHandWeaponSocket';
  // Weapon forward is -Z, grip at origin. Hand palm hangs -Y, so rotate X +90 deg aligns weapon forward with -Y -> let's orient socket so neutral hand +90deg pitch points forward (-Z).
  rightWeaponSocket.position.set(0, -0.055, -0.015);
  rightWeaponSocket.rotation.set(-Math.PI * 0.5, 0, 0);
  HandR.add(rightWeaponSocket);

  const leftSupportSocket = new THREE.Object3D();
  leftSupportSocket.name = 'LeftHandSupportSocket';
  leftSupportSocket.position.set(0, -0.05, 0);
  HandL.add(leftSupportSocket);

  const headGearSocket = new THREE.Object3D();
  headGearSocket.name = 'HeadGearSocket';
  headGearSocket.position.set(0, 0.11, 0);
  Head.add(headGearSocket);

  const backpackSocket = new THREE.Object3D();
  backpackSocket.name = 'BackpackSocket';
  backpackSocket.position.set(0, 0.05, 0.14);
  Chest.add(backpackSocket);

  Root.updateMatrixWorld(true);
  const orderedBones = BONE_ORDER.map((n) => bones[n]);
  const skeleton = new THREE.Skeleton(orderedBones);
  return { root: Root, bones, orderedBones, skeleton };
}

// ---------------------------------------------------------------------------
// Skin Weight Assignment (World Bind-Pose Bone Blending)
// ---------------------------------------------------------------------------

/**
 * Merges static BufferGeometries that each carry an explicit single-bone or dual-bone
 * skinning recipe, then assigns smooth skinIndex / skinWeight attributes cleanly.
 */
function buildSkinnedPart(name, material, parts) {
  const geos = [];
  for (const p of parts) {
    const g = p.geo;
    const count = g.attributes.position.count;
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    const pos = g.attributes.position;

    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const w = p.weightFn(vx, vy, vz); // returns array of [boneName, weight]
      let sum = 0;
      const entries = w.slice(0, 4);
      for (const [, weight] of entries) sum += weight;
      const norm = sum > 1e-6 ? 1 / sum : 1;
      for (let k = 0; k < 4; k++) {
        if (k < entries.length) {
          skinIndices[i * 4 + k] = BONE_INDEX[entries[k][0]];
          skinWeights[i * 4 + k] = entries[k][1] * norm;
        } else {
          skinIndices[i * 4 + k] = 0;
          skinWeights[i * 4 + k] = 0;
        }
      }
    }

    g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
    geos.push(g);
  }

  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function spineWeightFn(_x, y) {
  // Pelvis=0.95, Spine=1.10, Chest=1.28, Neck=1.48
  if (y <= 0.99) {
    return [['Pelvis', 1]];
  } else if (y < 1.15) {
    const t = smoothstep(0.99, 1.15, y);
    return [['Pelvis', 1 - t], ['Spine', t]];
  } else if (y < 1.32) {
    const t = smoothstep(1.15, 1.32, y);
    return [['Spine', 1 - t], ['Chest', t]];
  } else if (y < 1.47) {
    return [['Chest', 1]];
  } else {
    const t = smoothstep(1.47, 1.53, y);
    return [['Chest', 1 - t], ['Neck', t]];
  }
}

function makeArmWeightFn(side) {
  const s = side === 'L' ? -1 : 1;
  const sh = `Shoulder${side}`;
  const ua = `UpperArm${side}`;
  const fa = `Forearm${side}`;
  const ha = `Hand${side}`;
  return (x, y) => {
    const distShoulder = x * s;
    if (distShoulder < 0.165 && y > 1.34) {
      const t = smoothstep(0.11, 0.175, distShoulder);
      return [['Chest', 1 - t * 0.6], [sh, t * 0.6]];
    }
    if (y > 1.38) {
      const t = smoothstep(0.14, 0.21, distShoulder);
      return [[sh, 1 - t], [ua, t]];
    }
    if (y > 1.17) {
      return [[ua, 1]];
    }
    if (y > 1.10) {
      const t = smoothstep(1.17, 1.10, y);
      return [[ua, 1 - t], [fa, t]];
    }
    if (y > 0.91) {
      return [[fa, 1]];
    }
    if (y > 0.85) {
      const t = smoothstep(0.91, 0.85, y);
      return [[fa, 1 - t], [ha, t]];
    }
    return [[ha, 1]];
  };
}

function makeLegWeightFn(side) {
  const th = `Thigh${side}`;
  const sh = `Shin${side}`;
  const fo = `Foot${side}`;
  return (_x, y) => {
    if (y > 0.92) {
      const t = smoothstep(0.96, 0.90, y);
      return [['Pelvis', 1 - t], [th, t]];
    }
    if (y > 0.54) {
      return [[th, 1]];
    }
    if (y > 0.45) {
      const t = smoothstep(0.54, 0.45, y);
      return [[th, 1 - t], [sh, t]];
    }
    if (y > 0.14) {
      return [[sh, 1]];
    }
    if (y > 0.08) {
      const t = smoothstep(0.14, 0.08, y);
      return [[sh, 1 - t], [fo, t]];
    }
    return [[fo, 1]];
  };
}

// ---------------------------------------------------------------------------
// Character Mesh Builder (LOD0 and LOD1)
// ---------------------------------------------------------------------------

function buildOperatorModel(lodLevel) {
  const isLod0 = lodLevel === 0;
  const torsoSegs = isLod0 ? 22 : 12;
  const limbSegs = isLod0 ? 14 : 8;
  const headSegs = isLod0 ? 18 : 10;

  // Placeholder standard materials (overwritten at runtime by CharacterAppearanceLibrary)
  const matJacket = new THREE.MeshStandardMaterial({ name: 'Mat_Jacket', color: 0x3b483d, roughness: 0.82 });
  const matPants = new THREE.MeshStandardMaterial({ name: 'Mat_Pants', color: 0x2f3530, roughness: 0.86 });
  const matBoots = new THREE.MeshStandardMaterial({ name: 'Mat_Boots', color: 0x1c1e21, roughness: 0.72 });
  const matGloves = new THREE.MeshStandardMaterial({ name: 'Mat_Gloves', color: 0x22262a, roughness: 0.68 });
  const matSkin = new THREE.MeshStandardMaterial({ name: 'Mat_Skin', color: 0xc29578, roughness: 0.65 });
  const matBalaclava = new THREE.MeshStandardMaterial({ name: 'Mat_Balaclava', color: 0x1b1e23, roughness: 0.88 });
  const matHelmet = new THREE.MeshStandardMaterial({ name: 'Mat_Helmet', color: 0x2c332d, roughness: 0.52, metalness: 0.2 });
  const matGoggles = new THREE.MeshPhysicalMaterial({ name: 'Mat_Goggles', color: 0x15222b, roughness: 0.12, metalness: 0.35, clearcoat: 0.9 });
  const matVest = new THREE.MeshStandardMaterial({ name: 'Mat_Vest', color: 0x363b34, roughness: 0.78, metalness: 0.08 });
  const matBackpack = new THREE.MeshStandardMaterial({ name: 'Mat_Backpack', color: 0x41463a, roughness: 0.82 });

  const skelBundle = createHumanoidSkeleton();
  const rootGroup = new THREE.Group();
  rootGroup.name = `TacticalOperator_LOD${lodLevel}`;
  rootGroup.add(skelBundle.root);

  // 1. Body_Jacket (Torso combat shirt + collar + tactical sleeves with elbow pads)
  const torsoGeo = buildLoftedMesh([
    { y: 0.94, cx: 0, cz: 0.00, rx: 0.155, rz: 0.105, exp: 2.3 },
    { y: 1.03, cx: 0, cz: 0.00, rx: 0.148, rz: 0.102, exp: 2.3 },
    { y: 1.14, cx: 0, cz: -0.005, rx: 0.162, rz: 0.112, exp: 2.3 },
    { y: 1.28, cx: 0, cz: -0.008, rx: 0.188, rz: 0.124, exp: 2.4 },
    { y: 1.40, cx: 0, cz: -0.004, rx: 0.192, rz: 0.115, exp: 2.3 },
    { y: 1.46, cx: 0, cz: 0.00, rx: 0.105, rz: 0.085, exp: 2.0 },
    { y: 1.50, cx: 0, cz: 0.00, rx: 0.072, rz: 0.068, exp: 2.0 },
  ], torsoSegs);

  const jacketParts = [{ geo: torsoGeo, weightFn: spineWeightFn }];

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const armGeo = buildLoftedMesh([
      { y: 0.90, cx: s * 0.195, cz: 0.0, rx: 0.041, rz: 0.041, exp: 2.1 },
      { y: 1.01, cx: s * 0.195, cz: 0.0, rx: 0.048, rz: 0.048, exp: 2.1 },
      { y: 1.13, cx: s * 0.195, cz: 0.0, rx: 0.056, rz: 0.058, exp: 2.2 }, // elbow
      { y: 1.28, cx: s * 0.192, cz: 0.0, rx: 0.061, rz: 0.062, exp: 2.2 }, // bicep
      { y: 1.41, cx: s * 0.176, cz: 0.0, rx: 0.064, rz: 0.065, exp: 2.2 }, // deltoid
      { y: 1.44, cx: s * 0.145, cz: 0.0, rx: 0.055, rz: 0.060, exp: 2.1 },
    ], limbSegs);
    jacketParts.push({ geo: armGeo, weightFn: makeArmWeightFn(side) });

    if (isLod0) {
      // Tactical elbow pad cup
      const ep = makeRoundedBoxGeo(0.068, 0.082, 0.042, 2);
      transformGeo(ep, s * 0.20, 1.14, 0.045);
      jacketParts.push({ geo: ep, weightFn: makeArmWeightFn(side) });
    }
  }

  // 2. Body_Pants (Pelvis/hips, cargo thighs, knee pads, tapered calves, belt)
  const pelvisGeo = buildLoftedMesh([
    { y: 0.87, cx: 0, cz: 0.005, rx: 0.160, rz: 0.112, exp: 2.2 },
    { y: 0.93, cx: 0, cz: 0.004, rx: 0.168, rz: 0.118, exp: 2.3 },
    { y: 0.98, cx: 0, cz: 0.002, rx: 0.162, rz: 0.112, exp: 2.3 },
  ], torsoSegs);
  const pantsParts = [{ geo: pelvisGeo, weightFn: spineWeightFn }];

  // Tactical duty belt (snug to pelvis)
  const belt = makeRoundedBoxGeo(0.315, 0.044, 0.215, 2);
  transformGeo(belt, 0, 0.945, 0);
  pantsParts.push({ geo: belt, weightFn: () => [['Pelvis', 1]] });

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const legGeo = buildLoftedMesh([
      { y: 0.14, cx: s * 0.102, cz: 0.01, rx: 0.052, rz: 0.056, exp: 2.1 },
      { y: 0.31, cx: s * 0.102, cz: 0.01, rx: 0.064, rz: 0.068, exp: 2.1 }, // calf
      { y: 0.49, cx: s * 0.102, cz: -0.004, rx: 0.066, rz: 0.072, exp: 2.2 }, // knee
      { y: 0.70, cx: s * 0.102, cz: 0.0, rx: 0.082, rz: 0.086, exp: 2.2 }, // thigh
      { y: 0.89, cx: s * 0.100, cz: 0.0, rx: 0.088, rz: 0.092, exp: 2.2 },
    ], limbSegs);
    pantsParts.push({ geo: legGeo, weightFn: makeLegWeightFn(side) });

    // Cargo side pocket + knee pad
    const cargo = makeRoundedBoxGeo(0.036, 0.16, 0.11, 2);
    transformGeo(cargo, s * 0.175, 0.69, 0.005);
    pantsParts.push({ geo: cargo, weightFn: makeLegWeightFn(side) });

    const kneePad = makeRoundedBoxGeo(0.086, 0.105, 0.044, 2);
    transformGeo(kneePad, s * 0.102, 0.495, -0.066);
    pantsParts.push({ geo: kneePad, weightFn: makeLegWeightFn(side) });
  }

  // 3. Body_Boots (Laced tactical boots planted cleanly at y=0)
  const bootParts = [];
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const shaft = buildLoftedMesh([
      { y: 0.045, cx: s * 0.102, cz: 0.005, rx: 0.055, rz: 0.064, exp: 2.2 },
      { y: 0.105, cx: s * 0.102, cz: 0.010, rx: 0.056, rz: 0.060, exp: 2.1 },
      { y: 0.175, cx: s * 0.102, cz: 0.010, rx: 0.054, rz: 0.058, exp: 2.1 },
    ], limbSegs);
    bootParts.push({ geo: shaft, weightFn: () => [[`Foot${side}`, 1]] });

    const vamp = makeRoundedBoxGeo(0.112, 0.072, 0.245, 2);
    transformGeo(vamp, s * 0.102, 0.044, -0.042);
    bootParts.push({ geo: vamp, weightFn: () => [[`Foot${side}`, 1]] });

    const sole = makeRoundedBoxGeo(0.118, 0.024, 0.258, 1);
    transformGeo(sole, s * 0.102, 0.012, -0.042);
    bootParts.push({ geo: sole, weightFn: () => [[`Foot${side}`, 1]] });
  }

  // 4. Body_Gloves (Sculpted palm + knuckles + thumb + cuff at HandL/HandR)
  const gloveParts = [];
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const palm = makeRoundedBoxGeo(0.052, 0.11, 0.076, 2);
    transformGeo(palm, s * 0.195, 0.835, -0.006);
    gloveParts.push({ geo: palm, weightFn: () => [[`Hand${side}`, 1]] });

    const cuff = buildLoftedMesh([
      { y: 0.875, cx: s * 0.195, cz: 0.0, rx: 0.042, rz: 0.044, exp: 2.1 },
      { y: 0.915, cx: s * 0.195, cz: 0.0, rx: 0.045, rz: 0.046, exp: 2.1 },
    ], isLod0 ? 10 : 6);
    gloveParts.push({ geo: cuff, weightFn: () => [[`Forearm${side}`, 0.5], [`Hand${side}`, 0.5]] });

    if (isLod0) {
      const knuckle = makeRoundedBoxGeo(0.058, 0.032, 0.078, 1);
      transformGeo(knuckle, s * 0.20, 0.815, -0.01);
      gloveParts.push({ geo: knuckle, weightFn: () => [[`Hand${side}`, 1]] });
    }
  }

  // 5. Body_Skin (Sculpted Neck + Cranium/Upper Face)
  const neckGeo = buildLoftedMesh([
    { y: 1.47, cx: 0, cz: 0.002, rx: 0.062, rz: 0.062, exp: 2.0 },
    { y: 1.56, cx: 0, cz: 0.000, rx: 0.055, rz: 0.057, exp: 2.0 },
  ], headSegs);
  const headGeo = buildLoftedMesh([
    { y: 1.545, cx: 0, cz: -0.004, rx: 0.068, rz: 0.074, exp: 2.1 },
    { y: 1.595, cx: 0, cz: -0.010, rx: 0.082, rz: 0.095, exp: 2.2 }, // jaw/cheeks
    { y: 1.655, cx: 0, cz: -0.012, rx: 0.088, rz: 0.104, exp: 2.1 }, // brow
    { y: 1.715, cx: 0, cz: -0.004, rx: 0.084, rz: 0.098, exp: 2.0 },
    { y: 1.755, cx: 0, cz: 0.004, rx: 0.056, rz: 0.066, exp: 2.0 },
  ], headSegs);
  const nose = makeRoundedBoxGeo(0.026, 0.038, 0.032, 1);
  transformGeo(nose, 0, 1.635, -0.104, -0.18, 0, 0);
  const skinParts = [
    { geo: neckGeo, weightFn: (_x, y) => (y < 1.53 ? [['Neck', 1]] : [['Neck', 0.5], ['Head', 0.5]]) },
    { geo: headGeo, weightFn: () => [['Head', 1]] },
    { geo: nose, weightFn: () => [['Head', 1]] },
  ];

  // 6. Gear_Balaclava (Full tactical hood + neck gaiter covering cranium, jaw, and neck cleanly)
  const gaiterGeo = buildLoftedMesh([
    { y: 1.480, cx: 0, cz: 0.002, rx: 0.068, rz: 0.069, exp: 2.1 },
    { y: 1.555, cx: 0, cz: -0.006, rx: 0.074, rz: 0.082, exp: 2.2 },
    { y: 1.622, cx: 0, cz: -0.012, rx: 0.089, rz: 0.104, exp: 2.2 },
    { y: 1.665, cx: 0, cz: -0.008, rx: 0.091, rz: 0.106, exp: 2.1 },
    { y: 1.720, cx: 0, cz: 0.000, rx: 0.087, rz: 0.101, exp: 2.0 },
    { y: 1.760, cx: 0, cz: 0.006, rx: 0.060, rz: 0.070, exp: 2.0 },
  ], headSegs);
  const balaclavaParts = [
    { geo: gaiterGeo, weightFn: (_x, y) => (y < 1.545 ? [['Neck', 0.85], ['Head', 0.15]] : [['Head', 1]]) },
  ];

  // 7. Gear_Helmet (FAST/MICH ballistic shell + side rails + NVG shroud)
  const helmetShell = buildLoftedMesh([
    { y: 1.662, cx: 0, cz: 0.005, rx: 0.108, rz: 0.124, exp: 2.15 },
    { y: 1.705, cx: 0, cz: 0.002, rx: 0.114, rz: 0.130, exp: 2.15 },
    { y: 1.748, cx: 0, cz: 0.002, rx: 0.100, rz: 0.116, exp: 2.1 },
    { y: 1.780, cx: 0, cz: 0.005, rx: 0.066, rz: 0.076, exp: 2.0 },
  ], headSegs);
  const nvgMount = makeRoundedBoxGeo(0.044, 0.048, 0.022, 1);
  transformGeo(nvgMount, 0, 1.706, -0.127, -0.22, 0, 0);
  const helmetParts = [
    { geo: helmetShell, weightFn: () => [['Head', 1]] },
    { geo: nvgMount, weightFn: () => [['Head', 1]] },
  ];
  if (isLod0) {
    for (const s of [-1, 1]) {
      const rail = makeRoundedBoxGeo(0.014, 0.026, 0.12, 1);
      transformGeo(rail, s * 0.111, 1.685, 0.008, 0, s * 0.08, 0);
      helmetParts.push({ geo: rail, weightFn: () => [['Head', 1]] });
    }
  }

  // 8. Gear_Goggles (Ballistic visor lens + wrap strap)
  const goggleLens = makeRoundedBoxGeo(0.155, 0.044, 0.046, 2);
  transformGeo(goggleLens, 0, 1.652, -0.098);
  const goggleStrap = buildLoftedMesh([
    { y: 1.640, cx: 0, cz: 0.0, rx: 0.096, rz: 0.111, exp: 2.1 },
    { y: 1.664, cx: 0, cz: 0.0, rx: 0.096, rz: 0.111, exp: 2.1 },
  ], headSegs, { capBottom: false, capTop: false });
  const goggleParts = [
    { geo: goggleLens, weightFn: () => [['Head', 1]] },
    { geo: goggleStrap, weightFn: () => [['Head', 1]] },
  ];

  // 9. Gear_Vest (Modular plate carrier + shoulder straps + 3 front mag pouches)
  const frontPlate = makeRoundedBoxGeo(0.285, 0.30, 0.056, 2);
  transformGeo(frontPlate, 0, 1.27, -0.112);
  const backPlate = makeRoundedBoxGeo(0.275, 0.30, 0.052, 2);
  transformGeo(backPlate, 0, 1.27, 0.104);
  const cummerbund = buildLoftedMesh([
    { y: 1.13, cx: 0, cz: 0.0, rx: 0.184, rz: 0.128, exp: 2.4 },
    { y: 1.24, cx: 0, cz: 0.0, rx: 0.188, rz: 0.132, exp: 2.4 },
  ], torsoSegs, { capBottom: false, capTop: false });
  const vestParts = [
    { geo: frontPlate, weightFn: spineWeightFn },
    { geo: backPlate, weightFn: spineWeightFn },
    { geo: cummerbund, weightFn: spineWeightFn },
  ];
  for (const s of [-1, 1]) {
    const strap = makeRoundedBoxGeo(0.058, 0.036, 0.21, 1);
    transformGeo(strap, s * 0.105, 1.425, -0.004);
    vestParts.push({ geo: strap, weightFn: () => [['Chest', 1]] });
  }
  for (let p = -1; p <= 1; p++) {
    const pouch = makeRoundedBoxGeo(0.072, 0.115, 0.042, 1);
    transformGeo(pouch, p * 0.086, 1.185, -0.145);
    vestParts.push({ geo: pouch, weightFn: spineWeightFn });
  }

  // 10. Gear_Backpack (Contoured tapered tactical assault pack + lower pouch + top bedroll)
  const packMain = buildLoftedMesh([
    { y: 1.07, cx: 0, cz: 0.175, rx: 0.112, rz: 0.056, exp: 2.4 },
    { y: 1.18, cx: 0, cz: 0.185, rx: 0.126, rz: 0.068, exp: 2.5 },
    { y: 1.33, cx: 0, cz: 0.182, rx: 0.120, rz: 0.064, exp: 2.5 },
    { y: 1.44, cx: 0, cz: 0.168, rx: 0.095, rz: 0.048, exp: 2.3 },
  ], isLod0 ? 14 : 8);
  const packLower = makeRoundedBoxGeo(0.19, 0.12, 0.058, 2);
  transformGeo(packLower, 0, 1.14, 0.238);
  const packTop = makeRoundedBoxGeo(0.18, 0.055, 0.075, 2);
  transformGeo(packTop, 0, 1.445, 0.178);
  const backpackParts = [
    { geo: packMain, weightFn: () => [['Chest', 0.85], ['Spine', 0.15]] },
    { geo: packLower, weightFn: () => [['Chest', 0.7], ['Spine', 0.3]] },
    { geo: packTop, weightFn: () => [['Chest', 1]] },
  ];

  // Assemble all SkinnedMeshes onto shared skeleton
  const meshes = [
    buildSkinnedPart('Body_Jacket', matJacket, jacketParts),
    buildSkinnedPart('Body_Pants', matPants, pantsParts),
    buildSkinnedPart('Body_Boots', matBoots, bootParts),
    buildSkinnedPart('Body_Gloves', matGloves, gloveParts),
    buildSkinnedPart('Body_Skin', matSkin, skinParts),
    buildSkinnedPart('Gear_Balaclava', matBalaclava, balaclavaParts),
    buildSkinnedPart('Gear_Helmet', matHelmet, helmetParts),
    buildSkinnedPart('Gear_Goggles', matGoggles, goggleParts),
    buildSkinnedPart('Gear_Vest', matVest, vestParts),
    buildSkinnedPart('Gear_Backpack', matBackpack, backpackParts),
  ];

  for (const m of meshes) {
    m.bind(skelBundle.skeleton, new THREE.Matrix4());
    rootGroup.add(m);
  }

  return { rootGroup, skelBundle, meshes };
}

// ---------------------------------------------------------------------------
// First-Person Arms GLB Builder (Tactical Sleeves + Gloved Hands)
// Origin matches viewmodelGroup local space (weapon sits near [0,0,0], pointing -Z)
// ---------------------------------------------------------------------------

function buildFirstPersonArms() {
  const matSleeve = new THREE.MeshStandardMaterial({ name: 'Mat_Jacket', color: 0x3b483d, roughness: 0.82 });
  const matGlove = new THREE.MeshStandardMaterial({ name: 'Mat_Gloves', color: 0x1e2228, roughness: 0.65 });

  const root = new THREE.Group();
  root.name = 'FP_TacticalArms';

  // Right arm (positioned right around pistol/rifle grip at x~0.015, y~-0.05, z~0.04, angling back to shoulder)
  const rightSleeve = buildLoftedMesh([
    { y: 0.0, cx: 0, cz: 0, rx: 0.042, rz: 0.042, exp: 2.1 },
    { y: 0.18, cx: 0, cz: 0, rx: 0.050, rz: 0.050, exp: 2.1 },
    { y: 0.38, cx: 0, cz: 0, rx: 0.056, rz: 0.056, exp: 2.2 },
  ], 12);
  transformGeo(rightSleeve, 0.025, -0.058, 0.085, 1.32, 0.24, 0);
  const rSleeveMesh = new THREE.Mesh(rightSleeve, matSleeve);
  rSleeveMesh.name = 'FP_RightSleeve';

  const rightGlove = mergeGeometries([
    transformGeo(makeRoundedBoxGeo(0.056, 0.085, 0.088, 2), 0.018, -0.044, 0.036, 0.2, 0.06, 0),
    transformGeo(makeRoundedBoxGeo(0.048, 0.032, 0.052, 1), -0.008, -0.020, 0.005, 0.1, 0, 0),
  ], false);
  const rGloveMesh = new THREE.Mesh(rightGlove, matGlove);
  rGloveMesh.name = 'FP_RightGlove';

  // Left arm (cradling forend or cupping sidearm grip; offset dynamically in Player.ts for p9 vs rifles)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.name = 'FP_LeftArmGroup';

  const leftSleeve = buildLoftedMesh([
    { y: 0.0, cx: 0, cz: 0, rx: 0.042, rz: 0.042, exp: 2.1 },
    { y: 0.20, cx: 0, cz: 0, rx: 0.050, rz: 0.050, exp: 2.1 },
    { y: 0.40, cx: 0, cz: 0, rx: 0.056, rz: 0.056, exp: 2.2 },
  ], 12);
  transformGeo(leftSleeve, -0.10, -0.09, 0.04, 1.24, -0.68, 0);
  const lSleeveMesh = new THREE.Mesh(leftSleeve, matSleeve);
  lSleeveMesh.name = 'FP_LeftSleeve';

  const leftGlove = mergeGeometries([
    transformGeo(makeRoundedBoxGeo(0.060, 0.056, 0.095, 2), -0.012, -0.025, -0.15, 0.08, -0.15, 0),
    transformGeo(makeRoundedBoxGeo(0.026, 0.044, 0.056, 1), 0.016, -0.008, -0.155, 0, 0, -0.25),
  ], false);
  const lGloveMesh = new THREE.Mesh(leftGlove, matGlove);
  lGloveMesh.name = 'FP_LeftGlove';

  leftArmGroup.add(lSleeveMesh, lGloveMesh);
  root.add(rSleeveMesh, rGloveMesh, leftArmGroup);
  return root;
}

// ---------------------------------------------------------------------------
// Analytical 2-Bone IK + Animation Clip Synthesizer (All 9 Required States)
// ---------------------------------------------------------------------------

/**
 * Computes exact UpperArm & Forearm world-aligned local quaternions so that
 * Hand reaches targetWorld (in character space) given shoulderWorld and elbow pole.
 */
function solveTwoBoneArmIK(shoulderWorld, targetWorld, upperLen, foreLen, parentWorldQuat, poleDir) {
  const toTarget = new THREE.Vector3().subVectors(targetWorld, shoulderWorld);
  const maxReach = (upperLen + foreLen) * 0.992;
  const dist = Math.max(0.08, Math.min(maxReach, toTarget.length()));
  const dir = toTarget.clone().normalize();

  // Law of cosines for shoulder angle alpha
  const cosAlpha = Math.max(-1, Math.min(1,
    (upperLen * upperLen + dist * dist - foreLen * foreLen) / (2 * upperLen * dist),
  ));
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

  // Orthonormal frame toward target with elbow pole
  const bendAxis = new THREE.Vector3().crossVectors(dir, poleDir);
  if (bendAxis.lengthSq() < 1e-6) {
    bendAxis.set(1, 0, 0);
  } else {
    bendAxis.normalize();
  }
  const orthoPole = new THREE.Vector3().crossVectors(bendAxis, dir).normalize();

  const elbowWorld = shoulderWorld.clone()
    .addScaledVector(dir, upperLen * cosAlpha)
    .addScaledVector(orthoPole, upperLen * sinAlpha);

  const upperDir = new THREE.Vector3().subVectors(elbowWorld, shoulderWorld).normalize();
  const foreDir = new THREE.Vector3().subVectors(targetWorld, elbowWorld).normalize();

  // In bind pose, both UpperArm and Forearm point down (0, -1, 0)
  const restAxis = new THREE.Vector3(0, -1, 0);
  const qUpperWorld = new THREE.Quaternion().setFromUnitVectors(restAxis, upperDir);

  // Align local twist so local X/Z aligns cleanly with bendAxis
  const localBend = bendAxis.clone().normalize();
  const curX = new THREE.Vector3(1, 0, 0).applyQuaternion(qUpperWorld);
  const projCurX = curX.clone().addScaledVector(upperDir, -curX.dot(upperDir));
  if (projCurX.lengthSq() > 1e-6) {
    projCurX.normalize();
    const twistQ = new THREE.Quaternion().setFromUnitVectors(projCurX, localBend);
    // keep elbow bending cleanly
    const signCheck = twistQ.dot(new THREE.Quaternion());
    if (signCheck > 0.2) qUpperWorld.premultiply(twistQ);
  }

  const qUpperLocal = parentWorldQuat.clone().invert().multiply(qUpperWorld);

  const qForeWorld = new THREE.Quaternion().setFromUnitVectors(restAxis, foreDir);
  const qForeLocal = qUpperWorld.clone().invert().multiply(qForeWorld);

  return { qUpperLocal, qForeLocal, qUpperWorld, qForeWorld, elbowWorld };
}

/**
 * Computes HandR local quaternion such that RightHandWeaponSocket's local -Z
 * points cleanly along desiredForwardWorld (and socket +Y is world up).
 */
function solveHandRQuatForWeaponAim(foreWorldQuat, desiredForwardWorld = new THREE.Vector3(0, 0, -1)) {
  // RightHandWeaponSocket has rotation(-PI/2, 0, 0):
  // In socket space, weapon barrel points -Z, weapon top is +Y.
  // With socket rotX = -PI/2, socket -Z maps to HandR -Y, and socket +Y maps to HandR -Z!
  // Let's build the desired HandR world basis directly:
  // desired HandR -Y = desiredForwardWorld  => HandR +Y = -desiredForwardWorld
  // desired HandR -Z = worldUp (adjusted orthogonal to HandR +Y) => HandR +Z = -worldUp
  const yAxis = desiredForwardWorld.clone().normalize().negate();
  const approxNegUp = new THREE.Vector3(0, -1, 0);
  const xAxis = new THREE.Vector3().crossVectors(yAxis, approxNegUp).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const handWorldMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const handWorldQuat = new THREE.Quaternion().setFromRotationMatrix(handWorldMat);
  return foreWorldQuat.clone().invert().multiply(handWorldQuat);
}

/**
 * Evaluates a synthetic keyframe pose and solves exact FK/IK tracks so arms,
 * weapon socket, legs, torso, and ground contact are rock-solid in Three.js.
 */
function samplePoseToBoneTransforms(rig, pose) {
  const { bones } = rig;
  // Reset all bones to rest
  for (const name of BONE_ORDER) {
    bones[name].rotation.set(0, 0, 0);
  }
  bones.Root.position.set(0, 0, 0);
  bones.Pelvis.position.set(0, pose.pelvisY ?? 0.95, pose.pelvisZ ?? 0);
  bones.Pelvis.position.x = pose.pelvisX ?? 0;

  const setE = (name, rx = 0, ry = 0, rz = 0) => {
    bones[name].rotation.set(rx, ry, rz, 'YXZ');
  };

  setE('Pelvis', pose.pelvisRx ?? 0, pose.pelvisRy ?? 0, pose.pelvisRz ?? 0);
  setE('Spine', pose.spineRx ?? 0, pose.spineRy ?? 0, pose.spineRz ?? 0);
  setE('Chest', pose.chestRx ?? 0, pose.chestRy ?? 0, pose.chestRz ?? 0);
  setE('Neck', pose.neckRx ?? 0, pose.neckRy ?? 0, pose.neckRz ?? 0);
  setE('Head', pose.headRx ?? 0, pose.headRy ?? 0, pose.headRz ?? 0);

  setE('ThighL', pose.thighLRx ?? 0, pose.thighLRy ?? 0, pose.thighLRz ?? 0);
  setE('ShinL', pose.shinLRx ?? 0, 0, 0);
  setE('FootL', pose.footLRx ?? 0, pose.footLRy ?? 0, 0);

  setE('ThighR', pose.thighRRx ?? 0, pose.thighRRy ?? 0, pose.thighRRz ?? 0);
  setE('ShinR', pose.shinRRx ?? 0, 0, 0);
  setE('FootR', pose.footRRx ?? 0, pose.footRRy ?? 0, 0);

  bones.Root.updateMatrixWorld(true);

  if (pose.ikHands) {
    const chestWorldQ = new THREE.Quaternion();
    bones.Chest.getWorldQuaternion(chestWorldQ);

    // Right Arm IK
    const shRWorld = new THREE.Vector3();
    bones.UpperArmR.getWorldPosition(shRWorld);
    const parentRWorldQ = new THREE.Quaternion();
    bones.ShoulderR.getWorldQuaternion(parentRWorldQ);
    const ikR = solveTwoBoneArmIK(
      shRWorld,
      pose.handRTarget,
      0.28,
      0.26,
      parentRWorldQ,
      new THREE.Vector3(0.45, -0.35, 0.85).normalize(), // elbow out right & down/back
    );
    bones.UpperArmR.quaternion.copy(ikR.qUpperLocal);
    bones.ForearmR.quaternion.copy(ikR.qForeLocal);
    const aimDir = pose.weaponAimDir ?? new THREE.Vector3(0, 0, -1);
    bones.HandR.quaternion.copy(solveHandRQuatForWeaponAim(ikR.qForeWorld, aimDir));

    // Left Arm IK
    const shLWorld = new THREE.Vector3();
    bones.UpperArmL.getWorldPosition(shLWorld);
    const parentLWorldQ = new THREE.Quaternion();
    bones.ShoulderL.getWorldQuaternion(parentLWorldQ);
    const ikL = solveTwoBoneArmIK(
      shLWorld,
      pose.handLTarget,
      0.28,
      0.26,
      parentLWorldQ,
      new THREE.Vector3(-0.55, -0.4, 0.75).normalize(), // elbow out left & down/back
    );
    bones.UpperArmL.quaternion.copy(ikL.qUpperLocal);
    bones.ForearmL.quaternion.copy(ikL.qForeLocal);
    setE('HandL', pose.handLRx ?? 0.25, pose.handLRy ?? 0.35, pose.handLRz ?? -0.2);
  } else {
    setE('UpperArmL', pose.uaLRx ?? 0, pose.uaLRy ?? 0, pose.uaLRz ?? 0);
    setE('ForearmL', pose.faLRx ?? 0, 0, 0);
    setE('HandL', pose.handLRx ?? 0, 0, 0);
    setE('UpperArmR', pose.uaRRx ?? 0, pose.uaRRy ?? 0, pose.uaRRz ?? 0);
    setE('ForearmR', pose.faRRx ?? 0, 0, 0);
    setE('HandR', pose.handRRx ?? 0, 0, 0);
  }

  bones.Root.updateMatrixWorld(true);
}

function buildClipFromSampler(name, duration, sampleTimes, poseAtTime) {
  const rig = createHumanoidSkeleton();
  const pelvisPosData = [];
  const quatData = Object.fromEntries(BONE_ORDER.map((b) => [b, []]));

  for (const t of sampleTimes) {
    const pose = poseAtTime(t, duration);
    samplePoseToBoneTransforms(rig, pose);

    pelvisPosData.push(
      rig.bones.Pelvis.position.x,
      rig.bones.Pelvis.position.y,
      rig.bones.Pelvis.position.z,
    );
    for (const bName of BONE_ORDER) {
      const q = rig.bones[bName].quaternion;
      quatData[bName].push(q.x, q.y, q.z, q.w);
    }
  }

  const tracks = [
    new THREE.VectorKeyframeTrack('Pelvis.position', sampleTimes, pelvisPosData),
  ];
  for (const bName of BONE_ORDER) {
    if (bName === 'Root') continue;
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${bName}.quaternion`, sampleTimes, quatData[bName]),
    );
  }

  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.optimize();
  return clip;
}

function createAllAnimationClips() {
  const rifleHoldR = new THREE.Vector3(0.14, 1.24, -0.26);
  const rifleHoldL = new THREE.Vector3(-0.04, 1.26, -0.44);
  const lowReadyDir = new THREE.Vector3(-0.32, -0.18, -0.93).normalize();

  // 1. Idle (subtle breathing + combat low-ready stance)
  const idleTimes = [0, 0.7, 1.4, 2.1, 2.8];
  const idleClip = buildClipFromSampler('Idle', 2.8, idleTimes, (t, dur) => {
    const ph = (t / dur) * Math.PI * 2;
    const breath = Math.sin(ph) * 0.014;
    return {
      pelvisY: 0.94 + breath * 0.25,
      pelvisRy: -0.12,
      spineRx: -0.04 + breath * 0.4,
      chestRx: -0.05 + breath * 0.6,
      chestRy: 0.08,
      neckRx: 0.04,
      headRx: 0.03 - breath * 0.4,
      headRy: 0.04,
      thighLRx: 0.08,
      shinLRx: -0.12,
      footLRx: 0.04,
      thighRRx: -0.06,
      shinRRx: -0.10,
      footRRx: 0.16,
      ikHands: true,
      handRTarget: rifleHoldR.clone().add(new THREE.Vector3(0, breath * 0.5, 0)),
      handLTarget: rifleHoldL.clone().add(new THREE.Vector3(0, breath * 0.4, 0)),
      weaponAimDir: lowReadyDir,
    };
  });

  // 2. Walk (natural bipedal gait, knee bend, hip bob, low-ready carry)
  const walkTimes = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  const walkClip = buildClipFromSampler('Walk', 0.9, walkTimes, (t, dur) => {
    const ph = (t / dur) * Math.PI * 2;
    const s = Math.sin(ph);
    const bob = Math.abs(Math.cos(ph)) * 0.032;
    const kneeL = Math.max(0, -Math.cos(ph)) * 0.62 + 0.10;
    const kneeR = Math.max(0, Math.cos(ph)) * 0.62 + 0.10;
    return {
      pelvisY: 0.915 + bob,
      pelvisRy: s * 0.07,
      spineRx: -0.09,
      chestRx: -0.08,
      chestRy: -s * 0.08,
      headRx: 0.14,
      thighLRx: s * 0.46,
      shinLRx: -kneeL,
      footLRx: -s * 0.20 + 0.08,
      thighRRx: -s * 0.46,
      shinRRx: -kneeR,
      footRRx: s * 0.20 + 0.08,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.14, 1.21 + bob * 0.6, -0.27),
      handLTarget: new THREE.Vector3(-0.04, 1.23 + bob * 0.6, -0.45),
      weaponAimDir: lowReadyDir,
    };
  });

  // 3. Run (athletic sprint stride + forward lean + high-ready chest carry)
  const runTimes = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const runClip = buildClipFromSampler('Run', 0.6, runTimes, (t, dur) => {
    const ph = (t / dur) * Math.PI * 2;
    const s = Math.sin(ph);
    const bob = Math.abs(Math.cos(ph)) * 0.055;
    const kneeL = Math.max(0, -Math.cos(ph)) * 0.98 + 0.16;
    const kneeR = Math.max(0, Math.cos(ph)) * 0.98 + 0.16;
    return {
      pelvisY: 0.88 + bob,
      pelvisRy: s * 0.11,
      spineRx: -0.18,
      chestRx: -0.15,
      chestRy: -s * 0.12,
      headRx: 0.26,
      thighLRx: s * 0.72,
      shinLRx: -kneeL,
      footLRx: -s * 0.28 + 0.12,
      thighRRx: -s * 0.72,
      shinRRx: -kneeR,
      footRRx: s * 0.28 + 0.12,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.15, 1.17 + bob * 0.5, -0.31),
      handLTarget: new THREE.Vector3(-0.07, 1.19 + bob * 0.5, -0.45),
      weaponAimDir: new THREE.Vector3(-0.55, -0.12, -0.82).normalize(),
    };
  });

  // 4. Crouch (knees bent naturally, pelvis lowered to ~0.61m, boots flush with terrain)
  const crouchTimes = [0, 0.8, 1.6];
  const crouchClip = buildClipFromSampler('Crouch', 1.6, crouchTimes, (t, dur) => {
    const ph = (t / dur) * Math.PI * 2;
    const breath = Math.sin(ph) * 0.012;
    return {
      pelvisY: 0.61 + breath * 0.4,
      pelvisZ: 0.04,
      pelvisRy: -0.16,
      spineRx: -0.16,
      chestRx: -0.10 + breath * 0.4,
      headRx: 0.22,
      thighLRx: 0.94,
      shinLRx: -1.32,
      footLRx: 0.38,
      thighRRx: 0.62,
      shinRRx: -1.12,
      footRRx: 0.50,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.12, 0.96 + breath * 0.3, -0.28),
      handLTarget: new THREE.Vector3(0.02, 1.01 + breath * 0.3, -0.44),
      weaponAimDir: new THREE.Vector3(0, 0, -1),
    };
  });

  // 5. Aim (ADS shouldered rifle stance: barrel points dead level [0, 0, -1], left hand cradles handguard)
  const aimTimes = [0, 0.9, 1.8];
  const aimClip = buildClipFromSampler('Aim', 1.8, aimTimes, (t, dur) => {
    const ph = (t / dur) * Math.PI * 2;
    const breath = Math.sin(ph) * 0.004;
    return {
      pelvisY: 0.93,
      pelvisRy: -0.22,
      spineRx: -0.06,
      chestRx: -0.05,
      chestRy: 0.16,
      headRx: 0.10,
      headRy: 0.06,
      thighLRx: 0.12,
      shinLRx: -0.16,
      footLRx: 0.04,
      thighRRx: -0.08,
      shinRRx: -0.12,
      footRRx: 0.20,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.12, 1.36 + breath, -0.28),
      handLTarget: new THREE.Vector3(0.09, 1.41 + breath, -0.48),
      weaponAimDir: new THREE.Vector3(0, 0, -1),
    };
  });

  // 6. Reload (Left hand drops to chest mag pouch then inserts mag into receiver)
  const reloadTimes = [0, 0.35, 0.75, 1.15, 1.5];
  const reloadClip = buildClipFromSampler('Reload', 1.5, reloadTimes, (t) => {
    let lTarget;
    if (t < 0.45) {
      const k = smoothstep(0, 0.45, t);
      lTarget = new THREE.Vector3().lerpVectors(
        new THREE.Vector3(0.05, 1.34, -0.44),
        new THREE.Vector3(-0.04, 1.12, -0.22),
        k,
      );
    } else if (t < 1.05) {
      const k = smoothstep(0.45, 1.05, t);
      lTarget = new THREE.Vector3().lerpVectors(
        new THREE.Vector3(-0.04, 1.12, -0.22),
        new THREE.Vector3(0.09, 1.32, -0.35),
        k,
      );
    } else {
      const k = smoothstep(1.05, 1.5, t);
      lTarget = new THREE.Vector3().lerpVectors(
        new THREE.Vector3(0.09, 1.32, -0.35),
        new THREE.Vector3(0.06, 1.38, -0.46),
        k,
      );
    }
    return {
      pelvisY: 0.93,
      pelvisRy: -0.14,
      spineRx: -0.06,
      chestRx: -0.08,
      headRx: 0.18,
      thighLRx: 0.08,
      shinLRx: -0.12,
      thighRRx: -0.06,
      shinRRx: -0.10,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.13, 1.30, -0.25),
      handLTarget: lTarget,
      weaponAimDir: new THREE.Vector3(-0.22, 0.28, -0.93).normalize(),
    };
  });

  // 7. Jump (tucked airborne knees + raised chest carry)
  const jumpTimes = [0, 0.25, 0.6];
  const jumpClip = buildClipFromSampler('Jump', 0.6, jumpTimes, (t) => {
    const tuck = Math.sin(clamp01(t / 0.6) * Math.PI);
    return {
      pelvisY: 0.97 + tuck * 0.05,
      spineRx: -0.08,
      chestRx: -0.06,
      headRx: 0.12,
      thighLRx: 0.45 + tuck * 0.35,
      shinLRx: -0.82 - tuck * 0.35,
      footLRx: 0.25,
      thighRRx: 0.18 + tuck * 0.25,
      shinRRx: -0.48 - tuck * 0.30,
      footRRx: 0.22,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.15, 1.29, -0.25),
      handLTarget: new THREE.Vector3(-0.04, 1.31, -0.43),
      weaponAimDir: lowReadyDir,
    };
  });

  // 8. HitReaction (sharp torso flinch back + head recoil, smooth recovery)
  const hitTimes = [0, 0.08, 0.22, 0.42];
  const hitClip = buildClipFromSampler('HitReaction', 0.42, hitTimes, (t) => {
    const flinch = t < 0.08 ? smoothstep(0, 0.08, t) : 1 - smoothstep(0.08, 0.42, t);
    return {
      pelvisY: 0.93 - flinch * 0.04,
      spineRx: flinch * 0.24 - 0.04,
      chestRx: flinch * 0.28 - 0.04,
      chestRy: -flinch * 0.22,
      headRx: flinch * 0.24,
      thighLRx: 0.12,
      shinLRx: -0.18,
      thighRRx: -0.10,
      shinRRx: -0.14,
      ikHands: true,
      handRTarget: new THREE.Vector3(0.16 + flinch * 0.05, 1.26 + flinch * 0.08, -0.22),
      handLTarget: new THREE.Vector3(-0.05, 1.28 + flinch * 0.06, -0.40),
      weaponAimDir: new THREE.Vector3(-0.25, 0.25 * flinch, -0.95).normalize(),
    };
  });

  // 9. Elimination (supine collapse flush to terrain at y=0.12m, LoopOnce + clampWhenFinished)
  const elimTimes = [0, 0.25, 0.55, 0.9];
  const elimClip = buildClipFromSampler('Elimination', 0.9, elimTimes, (t) => {
    const k = smoothstep(0, 0.9, t);
    return {
      pelvisY: lerp(0.93, 0.12, Math.pow(k, 1.25)),
      pelvisZ: lerp(0, -0.18, k),
      pelvisRx: lerp(0, Math.PI * 0.48, k),
      pelvisRy: lerp(-0.1, 0.18, k),
      spineRx: lerp(-0.04, 0.05, k),
      chestRx: lerp(-0.04, 0.06, k),
      headRx: lerp(0.05, -0.12, k),
      thighLRx: lerp(0.10, -0.05, k),
      thighLRz: lerp(0, 0.14, k),
      shinLRx: lerp(-0.14, -0.08, k),
      thighRRx: lerp(-0.05, -0.12, k),
      thighRRz: lerp(0, -0.16, k),
      shinRRx: lerp(-0.10, -0.06, k),
      ikHands: false,
      uaLRx: lerp(0.35, -0.15, k),
      uaLRz: lerp(0.12, 0.52, k),
      faLRx: lerp(0.55, 0.15, k),
      uaRRx: lerp(0.38, -0.10, k),
      uaRRz: lerp(-0.12, -0.48, k),
      faRRx: lerp(0.50, 0.12, k),
    };
  });

  return [idleClip, walkClip, runClip, crouchClip, aimClip, reloadClip, jumpClip, hitClip, elimClip];
}

// ---------------------------------------------------------------------------
// GLB Export Helper + Verification
// ---------------------------------------------------------------------------

async function exportGLB(sceneOrGroup, animations, filename) {
  const exporter = new GLTFExporter();
  const ab = await new Promise((resolve, reject) => {
    exporter.parse(
      sceneOrGroup,
      (res) => resolve(res),
      (err) => reject(err),
      { binary: true, animations },
    );
  });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(ab));
  const stats = fs.statSync(outPath);

  let triCount = 0;
  let meshCount = 0;
  sceneOrGroup.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      meshCount += 1;
      const idx = o.geometry.index;
      triCount += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
    }
  });
  console.log(`[GLB] ${filename}: ${stats.size} bytes, ${meshCount} meshes, ${Math.round(triCount)} tris, ${animations.length} clips`);
}

async function main() {
  const clips = createAllAnimationClips();

  const lod0 = buildOperatorModel(0);
  await exportGLB(lod0.rootGroup, clips, 'tactical_operator_lod0.glb');

  const lod1 = buildOperatorModel(1);
  await exportGLB(lod1.rootGroup, clips, 'tactical_operator_lod1.glb');

  const fpArms = buildFirstPersonArms();
  await exportGLB(fpArms, [], 'fp_tactical_arms.glb');

  const licenseTxt = `LAST ZONE — Character Asset Inventory & License
===================================================

Assets in /public/assets/characters/:
1. tactical_operator_lod0.glb — High-detail semi-realistic tactical humanoid operator (LOD0, 20-bone skeleton, 10 SkinnedMesh components, 9 skeletal AnimationClips)
2. tactical_operator_lod1.glb — Reduced-poly distant tactical humanoid operator (LOD1, identical 20-bone skeleton & slots)
3. fp_tactical_arms.glb — First-person tactical forearm sleeves & gloved hands viewmodel overlay

License:
CC0 1.0 Universal (Project-Original procedural assets generated via scripts/generate-character-glbs.mjs for LAST ZONE).
Free for commercial and non-commercial use without attribution constraints.
`;
  fs.writeFileSync(path.join(OUT_DIR, 'LICENSE.txt'), licenseTxt, 'utf8');
  console.log('[GLB] Wrote LICENSE.txt');

  // Verify Aim / Crouch / Elimination FK poses
  const aimClip = THREE.AnimationClip.findByName(clips, 'Aim');
  const crouchClip = THREE.AnimationClip.findByName(clips, 'Crouch');
  const elimClip = THREE.AnimationClip.findByName(clips, 'Elimination');

  const testRig = createHumanoidSkeleton();
  const mixer = new THREE.AnimationMixer(testRig.root);

  const checkPose = (clip, timeSec, label, loopOnce = false) => {
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    if (loopOnce) {
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
    }
    act.reset().play();
    mixer.update(timeSec);
    testRig.root.updateMatrixWorld(true);

    const headP = new THREE.Vector3();
    const pelvisP = new THREE.Vector3();
    const handRP = new THREE.Vector3();
    const handLP = new THREE.Vector3();
    const wpnSock = testRig.root.getObjectByName('RightHandWeaponSocket');
    const wpnFwd = new THREE.Vector3(0, 0, -1);
    if (wpnSock) {
      const wq = new THREE.Quaternion();
      wpnSock.getWorldQuaternion(wq);
      wpnFwd.applyQuaternion(wq).normalize();
    }
    testRig.bones.Head.getWorldPosition(headP);
    testRig.bones.Pelvis.getWorldPosition(pelvisP);
    testRig.bones.HandR.getWorldPosition(handRP);
    testRig.bones.HandL.getWorldPosition(handLP);
    console.log(
      `[FK ${label}] Pelvis=${pelvisP.toArray().map((n) => n.toFixed(2))} HeadY=${headP.y.toFixed(2)} HandR=${handRP.toArray().map((n) => n.toFixed(2))} HandL=${handLP.toArray().map((n) => n.toFixed(2))} WpnFwd=${wpnFwd.toArray().map((n) => n.toFixed(2))}`,
    );
  };

  checkPose(aimClip, 0.2, 'Aim');
  checkPose(crouchClip, 0.2, 'Crouch');
  checkPose(elimClip, 0.9, 'Elimination', true);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
