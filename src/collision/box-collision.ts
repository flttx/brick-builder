import type { AABB, AABBRelation } from "./aabb.js";
import { aabbFromCenterSize, aabbRelation, transformAABB } from "./aabb.js";
import type { ColliderDefinition } from "./collider-definition.js";
import type { Transform } from "../math/transform.js";

export interface CollisionConfig {
  contactEpsilon: number;
  penetrationEpsilon: number;
}

export const DEFAULT_COLLISION_CONFIG: CollisionConfig = {
  contactEpsilon: 1e-5,
  penetrationEpsilon: 1e-5
};

export interface CollisionPairResult {
  movingColliderId: string;
  targetBrickId: string;
  targetColliderId: string;
  relation: AABBRelation;
  movingBounds: AABB;
  targetBounds: AABB;
}

export interface CollisionResult {
  valid: boolean;
  status: AABBRelation;
  pairs: CollisionPairResult[];
}

export const colliderLocalAABB = (collider: ColliderDefinition): AABB =>
  aabbFromCenterSize(collider.center, collider.size);

export const colliderWorldAABB = (collider: ColliderDefinition, transform: Transform): AABB =>
  transformAABB(colliderLocalAABB(collider), transform);

export const compareCollision = (
  moving: ColliderDefinition,
  movingTransform: Transform,
  target: ColliderDefinition,
  targetTransform: Transform,
  config: CollisionConfig = DEFAULT_COLLISION_CONFIG
): CollisionPairResult => {
  const movingBounds = colliderWorldAABB(moving, movingTransform);
  const targetBounds = colliderWorldAABB(target, targetTransform);
  const relation = aabbRelation(movingBounds, targetBounds, Math.max(config.contactEpsilon, config.penetrationEpsilon));
  return {
    movingColliderId: moving.id,
    targetBrickId: "",
    targetColliderId: target.id,
    relation,
    movingBounds,
    targetBounds
  };
};
