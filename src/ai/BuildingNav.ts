export type BuildingFloorTag = 0 | 1 | 2 | 'stairs';

export interface BuildingNavNode {
  id: string;
  x: number;
  y: number;
  z: number;
  floor: BuildingFloorTag;
  kind: 'outdoor' | 'door' | 'room' | 'stair';
  doorId?: string;
  neighbors: string[];
}

export interface BuildingNavWaypoint {
  buildingId: string;
  nodeId: string;
  x: number;
  y: number;
  z: number;
  floor: BuildingFloorTag;
  kind: 'outdoor' | 'door' | 'room' | 'stair';
  doorId?: string;
}

export interface BuildingDoorQuery {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  isOpen: boolean;
  isBlocking: boolean;
}

export interface NavigableBuilding {
  readonly id: string;
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly width: number;
  readonly depth: number;
  readonly rotY: number;
  readonly navNodes: readonly BuildingNavNode[];
  containsXZ(wx: number, wz: number, margin?: number): boolean;
  getWalkableHeight(wx: number, currentY: number, wz: number): number | null;
  resolveBotCollision(
    wx: number,
    wy: number,
    wz: number,
    radius?: number,
  ): { x: number; z: number; blockedDoorId: string | null };
  getDoorById(doorId: string): BuildingDoorQuery | null;
  setDoorOpen(doorId: string, open: boolean): boolean;
  findBlockingDoorNear(wx: number, wy: number, wz: number, radius?: number): BuildingDoorQuery | null;
  getExploreWaypoints(): ReadonlyArray<{ x: number; y: number; z: number; floor: BuildingFloorTag }>;
  getExteriorCorners(margin?: number): ReadonlyArray<{ x: number; z: number }>;
}

function distSq3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function findBestStartNode(
  building: NavigableBuilding,
  fromX: number,
  fromY: number,
  fromZ: number,
): BuildingNavNode | null {
  const inside = building.containsXZ(fromX, fromZ, 0.35);
  let best: BuildingNavNode | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < building.navNodes.length; i++) {
    const n = building.navNodes[i];
    if (!inside && n.kind !== 'outdoor') continue;
    const dSq = distSq3D(fromX, fromY, fromZ, n.x, n.y, n.z);
    // Strongly favor same vertical floor when starting inside
    const vertDiff = Math.abs(n.y - fromY);
    const floorPenalty = inside && vertDiff > 1.75 ? vertDiff * vertDiff * 9 : 0;
    const score = dSq + floorPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

function findBestGoalNode(
  building: NavigableBuilding,
  toX: number,
  toY: number,
  toZ: number,
): BuildingNavNode | null {
  const inside = building.containsXZ(toX, toZ, 0.35);
  let best: BuildingNavNode | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < building.navNodes.length; i++) {
    const n = building.navNodes[i];
    if (!inside && n.kind !== 'outdoor') continue;
    const dSq = distSq3D(toX, toY, toZ, n.x, n.y, n.z);
    const vertDiff = Math.abs(n.y - toY);
    const floorPenalty = inside && vertDiff > 1.75 ? vertDiff * vertDiff * 9 : 0;
    const score = dSq + floorPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

export function planBuildingRoute(
  building: NavigableBuilding,
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
): BuildingNavWaypoint[] {
  const start = findBestStartNode(building, fromX, fromY, fromZ);
  const goal = findBestGoalNode(building, toX, toY, toZ);
  if (!start || !goal) return [];

  if (start.id === goal.id) {
    return [
      {
        buildingId: building.id,
        nodeId: start.id,
        x: start.x,
        y: start.y,
        z: start.z,
        floor: start.floor,
        kind: start.kind,
        doorId: start.doorId,
      },
    ];
  }

  const nodeById = new Map<string, BuildingNavNode>();
  for (let i = 0; i < building.navNodes.length; i++) {
    nodeById.set(building.navNodes[i].id, building.navNodes[i]);
  }

  const distMap = new Map<string, number>();
  const prevMap = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (let i = 0; i < building.navNodes.length; i++) {
    const n = building.navNodes[i];
    distMap.set(n.id, Infinity);
    prevMap.set(n.id, null);
    unvisited.add(n.id);
  }
  distMap.set(start.id, 0);

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let minD = Infinity;
    for (const id of unvisited) {
      const d = distMap.get(id) ?? Infinity;
      if (d < minD) {
        minD = d;
        currentId = id;
      }
    }
    if (!currentId || minD === Infinity) break;
    if (currentId === goal.id) break;

    unvisited.delete(currentId);
    const curr = nodeById.get(currentId);
    if (!curr) continue;

    for (let i = 0; i < curr.neighbors.length; i++) {
      const nbId = curr.neighbors[i];
      if (!unvisited.has(nbId)) continue;
      const nb = nodeById.get(nbId);
      if (!nb) continue;

      const edgeCost = Math.sqrt(distSq3D(curr.x, curr.y, curr.z, nb.x, nb.y, nb.z));
      const alt = minD + edgeCost;
      if (alt < (distMap.get(nbId) ?? Infinity)) {
        distMap.set(nbId, alt);
        prevMap.set(nbId, currentId);
      }
    }
  }

  const chain: BuildingNavWaypoint[] = [];
  let trace: string | null = goal.id;
  while (trace) {
    const node = nodeById.get(trace);
    if (!node) break;
    chain.push({
      buildingId: building.id,
      nodeId: node.id,
      x: node.x,
      y: node.y,
      z: node.z,
      floor: node.floor,
      kind: node.kind,
      doorId: node.doorId,
    });
    trace = prevMap.get(trace) ?? null;
  }

  if (chain.length === 0 || chain[chain.length - 1].nodeId !== start.id) {
    return [];
  }
  chain.reverse();
  return chain;
}

export function doesSegmentCrossBuildingXZ(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  building: NavigableBuilding,
  pad = 1.2,
): boolean {
  const cos = Math.cos(-building.rotY);
  const sin = Math.sin(-building.rotY);

  const dax = ax - building.originX;
  const daz = az - building.originZ;
  const dbx = bx - building.originX;
  const dbz = bz - building.originZ;

  const lax = dax * cos + daz * sin;
  const laz = -dax * sin + daz * cos;
  const lbx = dbx * cos + dbz * sin;
  const lbz = -dbx * sin + dbz * cos;

  const hx = building.width * 0.5 + pad;
  const hz = building.depth * 0.5 + pad;

  let t0 = 0;
  let t1 = 1;
  const dx = lbx - lax;
  const dz = lbz - laz;

  const p = [-dx, dx, -dz, dz];
  const q = [lax + hx, hx - lax, laz + hz, hz - laz];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-6) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

export function pickExteriorCornerDetour(
  building: NavigableBuilding,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): { x: number; z: number } | null {
  const corners = building.getExteriorCorners(2.2);
  let bestCorner: { x: number; z: number } | null = null;
  let bestCost = Infinity;

  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    if (doesSegmentCrossBuildingXZ(fromX, fromZ, c.x, c.z, building, 0.25)) {
      continue;
    }
    const cost = Math.hypot(c.x - fromX, c.z - fromZ) + Math.hypot(toX - c.x, toZ - c.z);
    if (cost < bestCost) {
      bestCost = cost;
      bestCorner = c;
    }
  }

  if (bestCorner) return bestCorner;

  // Fallback to closest exterior corner if direct check was tight
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const cost = Math.hypot(c.x - fromX, c.z - fromZ) + Math.hypot(toX - c.x, toZ - c.z);
    if (cost < bestCost) {
      bestCost = cost;
      bestCorner = c;
    }
  }
  return bestCorner;
}
