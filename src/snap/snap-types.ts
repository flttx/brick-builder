import type { CollisionResult } from "../collision/box-collision.js";
import type { Transform } from "../math/transform.js";
import type { ConnectorPair } from "../connectors/connector.js";
import type { Vec3 } from "../math/vec3.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { BrickStore } from "../parts/brick-store.js";
import type { ConnectorSystem } from "../connectors/connector-system.js";
import type { ConnectorOccupancyIndex } from "../connectors/occupancy-index.js";
import type { ConnectorSpatialIndex } from "../connectors/connector-spatial-index.js";
import type { CollisionSolver } from "../collision/collision-solver.js";

export interface SnapCandidate {
  id: string;
  movingBrickId: string;
  targetBrickId: string;
  anchorPair: ConnectorPair;
  matchedPairs: ConnectorPair[];
  transform: Transform;
  score: number;
  distance: number;
  rotationError: number;
  pointerDistance?: number;
  collision: CollisionResult;
  stable: boolean;
}

export interface SnapRequest {
  movingBrickId: string;
  freeTransform: Transform;
  pointerWorld?: Vec3;
  cameraDirection?: Vec3;
  previousCandidate?: SnapCandidate;
  mode?: "auto" | "explicit_connector" | "disabled";
}

export interface ExplicitSnapRequest {
  movingBrickId: string;
  movingConnectorId: string;
  targetBrickId: string;
  targetConnectorId: string;
  freeTransform: Transform;
}

export interface PrecisionSnapRequest {
  movingBrickId: string;
  movingConnectorA1Id: string;
  movingConnectorA2Id: string;
  targetBrickId: string;
  targetConnectorB1Id: string;
  targetConnectorB2Id: string;
  freeTransform: Transform;
}

export type ExplicitSnapInvalidReason =
  | "connector_occupied"
  | "connector_incompatible"
  | "collision"
  | "invalid_rotation";

export type PrecisionSnapInvalidReason = ExplicitSnapInvalidReason | "duplicate_connector" | "distance_mismatch" | "below_ground";

export interface ExplicitSnapResult {
  valid: boolean;
  transform?: Transform;
  matchedPairs: ConnectorPair[];
  collision: CollisionResult;
  reason?: ExplicitSnapInvalidReason;
  candidate?: SnapCandidate;
}

export interface PrecisionSnapResult {
  valid: boolean;
  transform?: Transform;
  matchedPairs: ConnectorPair[];
  collision: CollisionResult;
  reason?: PrecisionSnapInvalidReason;
  candidate?: SnapCandidate;
}

export interface SnapContext {
  parts: PartRegistry;
  bricks: BrickStore;
  connectors: ConnectorSystem;
  occupancy: ConnectorOccupancyIndex;
  spatial: ConnectorSpatialIndex;
  collision: CollisionSolver;
}

export interface DragResult {
  transform: Transform;
  mode: "free" | "snap";
  candidate?: SnapCandidate;
  collision: CollisionResult;
  valid: boolean;
}
