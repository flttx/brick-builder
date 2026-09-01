import type { Transform } from "../math/transform.js";
import { transformPoint } from "../math/transform.js";
import type { Vec3 } from "../math/vec3.js";
import { add, scale } from "../math/vec3.js";

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export type AABBRelation = "separated" | "touching" | "penetrating";

export const aabbFromCenterSize = (center: Vec3, size: Vec3): AABB => {
  const half = scale(size, 0.5);
  return {
    min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
    max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z }
  };
};

export const transformAABB = (local: AABB, transform: Transform): AABB => {
  const corners: Vec3[] = [];
  for (const x of [local.min.x, local.max.x]) {
    for (const y of [local.min.y, local.max.y]) {
      for (const z of [local.min.z, local.max.z]) {
        corners.push(transformPoint(transform, { x, y, z }));
      }
    }
  }
  return corners.reduce(aabbUnion, undefined as AABB | undefined) as AABB;
};

export const aabbUnion = (current: AABB | undefined, next: Vec3 | AABB): AABB => {
  const nextAABB = "min" in next ? next : { min: next, max: next };
  if (current === undefined) {
    return { min: { ...nextAABB.min }, max: { ...nextAABB.max } };
  }
  return {
    min: {
      x: Math.min(current.min.x, nextAABB.min.x),
      y: Math.min(current.min.y, nextAABB.min.y),
      z: Math.min(current.min.z, nextAABB.min.z)
    },
    max: {
      x: Math.max(current.max.x, nextAABB.max.x),
      y: Math.max(current.max.y, nextAABB.max.y),
      z: Math.max(current.max.z, nextAABB.max.z)
    }
  };
};

export const aabbCenter = (aabb: AABB): Vec3 => scale(add(aabb.min, aabb.max), 0.5);

export const aabbRelation = (a: AABB, b: AABB, epsilon = 1e-6): AABBRelation => {
  const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const overlapY = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (overlapX < -epsilon || overlapY < -epsilon || overlapZ < -epsilon) {
    return "separated";
  }
  if (Math.abs(overlapX) <= epsilon || Math.abs(overlapY) <= epsilon || Math.abs(overlapZ) <= epsilon) {
    return "touching";
  }
  return "penetrating";
};

export const aabbIntersects = (a: AABB, b: AABB, epsilon = 1e-6): boolean =>
  aabbRelation(a, b, epsilon) !== "separated";
