import { aabbUnion } from "../collision/aabb.js";
import { colliderLocalAABB } from "../collision/box-collision.js";
import type { AABB } from "../collision/aabb.js";
import type { PartDefinition } from "./part-definition.js";

export interface PartDefinitionValidationIssue {
  partId: string;
  code: string;
  message: string;
}

export const validatePartDefinition = (part: PartDefinition, tolerance = 0.25): PartDefinitionValidationIssue[] => {
  const issues: PartDefinitionValidationIssue[] = [];
  const issue = (code: string, message: string): void => { issues.push({ partId: part.id, code, message }); };
  const dimensions = [part.dimensions.width, part.dimensions.height, part.dimensions.depth];
  if (!dimensions.every((value) => Number.isFinite(value) && value > 0)) {
    issue("dimensions", "Part dimensions must be finite and positive");
  }

  let colliderBounds: AABB | undefined;
  for (const collider of part.colliders) {
    if (collider.type !== "box" || !finiteVec3(collider.center) || !finiteVec3(collider.size) || !collider.size.x || !collider.size.y || !collider.size.z || collider.size.x < 0 || collider.size.y < 0 || collider.size.z < 0) {
      issue("collider", `Collider ${collider.id} is invalid`);
      continue;
    }
    colliderBounds = aabbUnion(colliderBounds, colliderLocalAABB(collider));
  }

  if (colliderBounds !== undefined) {
    const colliderSize = [
      colliderBounds.max.x - colliderBounds.min.x,
      colliderBounds.max.y - colliderBounds.min.y,
      colliderBounds.max.z - colliderBounds.min.z
    ];
    if (colliderSize.some((value, index) => value > (dimensions[index] ?? 0) + tolerance)) {
      issue("collider_bounds", "Collider envelope exceeds part dimensions");
    }
  }

  for (const connector of part.connectors) {
    if (!finiteVec3(connector.position)) {
      issue("connector_position", `Connector ${connector.id} has an invalid position`);
      continue;
    }
    if (colliderBounds !== undefined && !pointWithinBounds(connector.position, colliderBounds, tolerance)) {
      issue("connector_bounds", `Connector ${connector.id} lies outside the collider envelope`);
    }
  }
  return issues;
};

const finiteVec3 = (value: { x: number; y: number; z: number }): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

const pointWithinBounds = (point: { x: number; y: number; z: number }, bounds: AABB, tolerance: number): boolean =>
  point.x >= bounds.min.x - tolerance && point.x <= bounds.max.x + tolerance &&
  point.y >= bounds.min.y - tolerance && point.y <= bounds.max.y + tolerance &&
  point.z >= bounds.min.z - tolerance && point.z <= bounds.max.z + tolerance;
