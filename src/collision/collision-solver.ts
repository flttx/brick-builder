import type { BrickInstance } from "../parts/brick-instance.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { BrickSpatialIndex, WorldCollider } from "../spatial/brick-spatial-index.js";
import type { Transform } from "../math/transform.js";
import { aabbCenter, aabbRelation, type AABB } from "./aabb.js";
import type { CollisionConfig, CollisionPairResult, CollisionResult } from "./box-collision.js";
import { colliderWorldAABB, DEFAULT_COLLISION_CONFIG } from "./box-collision.js";
import type { ColliderDefinition } from "./collider-definition.js";
import type { Vec3 } from "../math/vec3.js";

export class CollisionSolver {
  public constructor(
    private readonly parts: PartRegistry,
    private readonly brickSpatial: BrickSpatialIndex,
    private readonly config: CollisionConfig = DEFAULT_COLLISION_CONFIG
  ) {}

  public checkBrick(brick: BrickInstance, transform: Transform, excludeBrickId = brick.id): CollisionResult {
    const definition = this.parts.get(brick.partId);
    const movingBounds = this.combinedBounds(definition.colliders.map((collider) => colliderWorldAABB(collider, transform)));
    const targets = this.brickSpatial.queryAABB(movingBounds, excludeBrickId);
    const pairs: CollisionPairResult[] = [];
    for (const target of targets) {
      const relation = aabbRelation(movingBounds, target.bounds, Math.max(this.config.contactEpsilon, this.config.penetrationEpsilon));
      pairs.push({
        movingColliderId: "combined",
        targetBrickId: target.brickId,
        targetColliderId: target.colliderId,
        relation,
        movingBounds,
        targetBounds: target.bounds
      });
    }
    const status = pairs.some((pair) => pair.relation === "penetrating")
      ? "penetrating"
      : pairs.some((pair) => pair.relation === "touching") ? "touching" : "separated";
    const push = status === "penetrating" ? findSmallestSeparation(movingBounds, pairs) : undefined;
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

  private combinedBounds(bounds: AABB[]): AABB {
    const first = bounds[0];
    if (first === undefined) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }
    return bounds.slice(1).reduce((current, next) => ({
      min: {
        x: Math.min(current.min.x, next.min.x),
        y: Math.min(current.min.y, next.min.y),
        z: Math.min(current.min.z, next.min.z)
      },
      max: {
        x: Math.max(current.max.x, next.max.x),
        y: Math.max(current.max.y, next.max.y),
        z: Math.max(current.max.z, next.max.z)
      }
    }), first);
  }
}

const findSmallestSeparation = (movingBounds: AABB, pairs: CollisionPairResult[]): { depth: number; vector: Vec3 } | undefined => {
  const movingCenter = aabbCenter(movingBounds);
  let smallest: { depth: number; vector: Vec3 } | undefined;
  for (const pair of pairs) {
    if (pair.relation !== "penetrating") continue;
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
