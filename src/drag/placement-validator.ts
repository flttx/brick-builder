import { isQuarterYRotation } from "../math/quantize.js";
import type { Transform } from "../math/transform.js";
import { distance } from "../math/vec3.js";
import type { ConnectorOccupancyIndex } from "../connectors/occupancy-index.js";
import type { ConnectorSystem } from "../connectors/connector-system.js";
import type { ConnectorPair } from "../connectors/connector.js";
import type { BrickStore } from "../parts/brick-store.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { CollisionResult } from "../collision/box-collision.js";
import type { CollisionSolver } from "../collision/collision-solver.js";

export type PlacementInvalidReason =
  | "collision"
  | "connector_occupied"
  | "connector_incompatible"
  | "invalid_rotation"
  | "out_of_bounds";

export interface PlacementValidationRequest {
  brickId: string;
  transform: Transform;
  matchedPairs?: ConnectorPair[];
  bounds?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

export interface PlacementValidationResult {
  valid: boolean;
  reasons: PlacementInvalidReason[];
  collision: CollisionResult;
}

export interface PlacementValidatorContext {
  parts: PartRegistry;
  bricks: BrickStore;
  connectors: ConnectorSystem;
  occupancy: ConnectorOccupancyIndex;
  collision: CollisionSolver;
}

export class PlacementValidator {
  public constructor(private readonly context: PlacementValidatorContext) {}

  public validate(request: PlacementValidationRequest): PlacementValidationResult {
    const reasons: PlacementInvalidReason[] = [];
    const brick = this.context.bricks.get(request.brickId);
    if (!isQuarterYRotation(request.transform.rotation)) {
      reasons.push("invalid_rotation");
    }
    const collision = this.context.collision.checkBrick(brick, request.transform);
    if (!collision.valid) {
      reasons.push("collision");
    }
    if (request.bounds !== undefined && !this.withinBounds(request.transform.position, request.bounds)) {
      reasons.push("out_of_bounds");
    }
    for (const pair of request.matchedPairs ?? []) {
      if (!this.context.connectors.compatibility.areCompatible(pair.moving, pair.target, distance(pair.moving.worldPosition, pair.target.worldPosition))) {
        reasons.push("connector_incompatible");
      }
      if (!this.context.occupancy.canOccupy(pair.target, "pending") || !this.context.occupancy.canOccupy(pair.moving, "pending")) {
        reasons.push("connector_occupied");
      }
    }
    return {
      valid: reasons.length === 0,
      reasons: [...new Set(reasons)],
      collision
    };
  }

  private withinBounds(position: { x: number; y: number; z: number }, bounds: NonNullable<PlacementValidationRequest["bounds"]>): boolean {
    return (
      position.x >= bounds.min.x && position.x <= bounds.max.x &&
      position.y >= bounds.min.y && position.y <= bounds.max.y &&
      position.z >= bounds.min.z && position.z <= bounds.max.z
    );
  }
}
