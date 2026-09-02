import type { BrickInstance } from "../parts/brick-instance.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { BrickSpatialIndex, WorldCollider } from "../spatial/brick-spatial-index.js";
import { GROUND_LEVEL, type Transform } from "../math/transform.js";
import type { Quat } from "../math/quat.js";
import { aabbCenter, aabbRelation, aabbUnion, type AABB } from "./aabb.js";
import type { CollisionConfig, CollisionPairResult, CollisionResult } from "./box-collision.js";
import { colliderLocalAABB, colliderWorldAABB, DEFAULT_COLLISION_CONFIG } from "./box-collision.js";
import type { ColliderDefinition } from "./collider-definition.js";
import type { Vec3 } from "../math/vec3.js";

/** Returns the transform y that keeps a part's rotated collider on the ground. */
export const groundPositionYForColliders = (
  colliders: ColliderDefinition[],
  rotation: Quat,
  groundLevel = GROUND_LEVEL
): number => {
  if (colliders.length === 0) return groundLevel;
  const localBounds = combineBounds(colliders.map(colliderLocalAABB));
  const rotatedBounds = combineBounds(colliders.map((collider) => colliderWorldAABB(collider, {
    position: { x: 0, y: 0, z: 0 },
    rotation
  })));
  return groundLevel + Math.max(0, localBounds.min.y - rotatedBounds.min.y);
};

export class CollisionSolver {
  public constructor(
    private readonly parts: PartRegistry,
    private readonly brickSpatial: BrickSpatialIndex,
    private readonly config: CollisionConfig = DEFAULT_COLLISION_CONFIG
  ) {}

  public checkBrick(brick: BrickInstance, transform: Transform, excludeBrickId = brick.id): CollisionResult {
    const pairs: CollisionPairResult[] = [];
    const definition = this.parts.get(brick.partId);
    for (const collider of definition.colliders) {
      const movingBounds = colliderWorldAABB(collider, transform);
      for (const target of this.brickSpatial.queryAABB(movingBounds, excludeBrickId)) {
        const relation = aabbRelation(movingBounds, target.bounds, Math.max(this.config.contactEpsilon, this.config.penetrationEpsilon));
        pairs.push({
          movingColliderId: collider.id,
          targetBrickId: target.brickId,
          targetColliderId: target.colliderId,
          relation,
          movingBounds,
          targetBounds: target.bounds
        });
      }
    }
    const status = pairs.some((pair) => pair.relation === "penetrating")
      ? "penetrating"
      : pairs.some((pair) => pair.relation === "touching") ? "touching" : "separated";
    const push = status === "penetrating" ? findSmallestSeparation(pairs) : undefined;
    return {
      valid: status !== "penetrating",
      status,
      pairs,
      ...(push === undefined ? {} : { penetrationDepth: push.depth, separationVector: push.vector })
    };
  }

  public checkTransform(brick: BrickInstance, transform: Transform): CollisionResult {
    return this.checkBrick(brick, transform, brick.id);
  }

}

const combineBounds = (bounds: AABB[]): AABB => {
  const first = bounds[0];
  if (first === undefined) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  return bounds.slice(1).reduce((current, next) => aabbUnion(current, next), first);
};

const findSmallestSeparation = (pairs: CollisionPairResult[]): { depth: number; vector: Vec3 } | undefined => {
  let smallest: { depth: number; vector: Vec3 } | undefined;
  for (const pair of pairs) {
    if (pair.relation !== "penetrating") continue;
    const movingCenter = aabbCenter(pair.movingBounds);
    const overlap = {
      x: Math.min(pair.movingBounds.max.x, pair.targetBounds.max.x) - Math.max(pair.movingBounds.min.x, pair.targetBounds.min.x),
      y: Math.min(pair.movingBounds.max.y, pair.targetBounds.max.y) - Math.max(pair.movingBounds.min.y, pair.targetBounds.min.y),
      z: Math.min(pair.movingBounds.max.z, pair.targetBounds.max.z) - Math.max(pair.movingBounds.min.z, pair.targetBounds.min.z)
    };
    const targetCenter = aabbCenter(pair.targetBounds);
    const axis = overlap.x <= overlap.y && overlap.x <= overlap.z ? "x" : overlap.y <= overlap.z ? "y" : "z";
    const depth = overlap[axis];
    const direction = movingCenter[axis] >= targetCenter[axis] ? 1 : -1;
    const vector = { x: 0, y: 0, z: 0 };
    vector[axis] = direction * (depth + 1e-4);
    if (smallest === undefined || depth < smallest.depth) smallest = { depth, vector };
  }
  return smallest;
};

export const toWorldCollider = (
  brick: BrickInstance,
  collider: ColliderDefinition,
  transform: Transform = brick.transform
): WorldCollider => {
  const bounds = colliderWorldAABB(collider, transform);
  return {
    id: `${brick.id}:${collider.id}`,
    brickId: brick.id,
    colliderId: collider.id,
    bounds,
    center: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    }
  };
};
