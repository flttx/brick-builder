import type { BrickInstance } from "../parts/brick-instance.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { BrickSpatialIndex, WorldCollider } from "../spatial/brick-spatial-index.js";
import type { Transform } from "../math/transform.js";
import { aabbRelation, type AABB } from "./aabb.js";
import type { CollisionConfig, CollisionPairResult, CollisionResult } from "./box-collision.js";
import { colliderWorldAABB, DEFAULT_COLLISION_CONFIG } from "./box-collision.js";
import type { ColliderDefinition } from "./collider-definition.js";

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
    return {
      valid: status !== "penetrating",
      status,
      pairs
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
