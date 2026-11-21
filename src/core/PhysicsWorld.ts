import RAPIER from '@dimforge/rapier3d-compat';

export interface RayHitResult {
  distance: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  colliderHandle: number;
}

export class PhysicsWorld {
  private static rapierInitialized = false;
  public world!: RAPIER.World;
  public playerBody!: RAPIER.RigidBody;
  public playerCollider!: RAPIER.Collider;
  public characterController!: RAPIER.KinematicCharacterController;
  private botColliders = new Map<number, string>();
  private staticColliders = new Set<number>();

  public async init(): Promise<void> {
    if (!PhysicsWorld.rapierInitialized) {
      await RAPIER.init();
      PhysicsWorld.rapierInitialized = true;
    }
    this.world = new RAPIER.World({ x: 0.0, y: -24.0, z: 0.0 });
  }

  public resetWorld(): void {
    this.botColliders.clear();
    this.staticColliders.clear();
    if (this.world) {
      this.world.free();
    }
    this.world = new RAPIER.World({ x: 0.0, y: -24.0, z: 0.0 });
  }

  public buildTerrainHeightfield(
    size: number,
    segments: number,
    heightSampler: (x: number, z: number) => number,
  ): void {
    const nrows = segments;
    const ncols = segments;
    const heights = new Float32Array((nrows + 1) * (ncols + 1));

    // Rapier Heightfield: row index maps along Z, column index maps along X
    // heights[col * (nrows + 1) + row]
    const half = size * 0.5;
    for (let col = 0; col <= ncols; col++) {
      const x = -half + (col / ncols) * size;
      for (let row = 0; row <= nrows; row++) {
        const z = -half + (row / nrows) * size;
        heights[col * (nrows + 1) + row] = heightSampler(x, z);
      }
    }

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.heightfield(
      nrows,
      ncols,
      heights,
      new RAPIER.Vector3(size, 1.0, size),
    );
    const collider = this.world.createCollider(colliderDesc, body);
    this.staticColliders.add(collider.handle);
  }

  public addStaticBox(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotationY = 0,
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz);
    if (rotationY !== 0) {
      const halfAngle = rotationY * 0.5;
      bodyDesc.setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) });
    }
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    const collider = this.world.createCollider(colliderDesc, body);
    this.staticColliders.add(collider.handle);
    return collider;
  }

  public addStaticCylinder(
    cx: number,
    cy: number,
    cz: number,
    halfHeight: number,
    radius: number,
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius);
    const collider = this.world.createCollider(colliderDesc, body);
    this.staticColliders.add(collider.handle);
    return collider;
  }

  public createPlayerController(startX: number, startY: number, startZ: number): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      startX,
      startY,
      startZ,
    );
    this.playerBody = this.world.createRigidBody(bodyDesc);

    // Capsule: halfHeight = 0.55, radius = 0.35 => total height = 1.8m
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.55, 0.35);
    this.playerCollider = this.world.createCollider(colliderDesc, this.playerBody);

    const controller = this.world.createCharacterController(0.04);
    controller.enableAutostep(0.45, 0.25, true);
    controller.enableSnapToGround(0.35);
    controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);
    this.characterController = controller;
  }

  public setPlayerCrouchCollider(crouching: boolean): void {
    if (!this.playerCollider) return;
    this.playerCollider.setHalfHeight(crouching ? 0.3 : 0.55);
  }

  public movePlayer(
    desiredDx: number,
    desiredDy: number,
    desiredDz: number,
  ): { x: number; y: number; z: number; grounded: boolean } {
    this.characterController.computeColliderMovement(this.playerCollider, {
      x: desiredDx,
      y: desiredDy,
      z: desiredDz,
    });
    const corrected = this.characterController.computedMovement();
    const pos = this.playerBody.translation();
    const nextX = pos.x + corrected.x;
    const nextY = pos.y + corrected.y;
    const nextZ = pos.z + corrected.z;
    this.playerBody.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });
    this.world.step();

    return {
      x: nextX,
      y: nextY,
      z: nextZ,
      grounded: this.characterController.computedGrounded(),
    };
  }

  public teleportPlayer(x: number, y: number, z: number): void {
    this.playerBody.setTranslation({ x, y, z }, true);
    this.playerBody.setNextKinematicTranslation({ x, y, z });
  }

  public registerBotCollider(
    botId: string,
    x: number,
    y: number,
    z: number,
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.55, 0.42);
    const collider = this.world.createCollider(colliderDesc, body);
    this.botColliders.set(collider.handle, botId);
    return { body, collider };
  }

  public unregisterBotCollider(collider: RAPIER.Collider, body: RAPIER.RigidBody): void {
    this.botColliders.delete(collider.handle);
    this.world.removeRigidBody(body);
  }

  public getBotIdByColliderHandle(handle: number): string | null {
    return this.botColliders.get(handle) ?? null;
  }

  public castRay(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxToi: number,
    excludeColliderHandle?: number,
  ): RayHitResult | null {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      undefined,
      undefined,
      excludeColliderHandle !== undefined
        ? this.world.getCollider(excludeColliderHandle) ?? undefined
        : undefined,
    );
    if (!hit) return null;
    const pt = ray.pointAt(hit.timeOfImpact);
    return {
      distance: hit.timeOfImpact,
      point: { x: pt.x, y: pt.y, z: pt.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      colliderHandle: hit.collider.handle,
    };
  }

  public castWorldRay(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxToi: number,
  ): RayHitResult | null {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => this.staticColliders.has(collider.handle),
    );
    if (!hit) return null;
    const pt = ray.pointAt(hit.timeOfImpact);
    return {
      distance: hit.timeOfImpact,
      point: { x: pt.x, y: pt.y, z: pt.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      colliderHandle: hit.collider.handle,
    };
  }

  public dispose(): void {
    this.botColliders.clear();
    this.staticColliders.clear();
    if (this.world) {
      this.world.free();
    }
  }
}
