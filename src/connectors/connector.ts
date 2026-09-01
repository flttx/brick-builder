import type { Quat } from "../math/quat.js";
import type { Vec3 } from "../math/vec3.js";

export type ConnectorType = "stud" | "anti_stud";
export type ConnectorRole = "plug" | "socket" | "neutral";
export type OccupiedRule = "single" | "multi";

export interface ConnectorDefinition {
  id: string;
  type: ConnectorType;
  role: ConnectorRole;
  position: Vec3;
  rotation: Quat;
  normal: Vec3;
  compatibilityGroup: string;
  snapRadius: number;
  occupiedRule: OccupiedRule;
}

export interface WorldConnector extends ConnectorDefinition {
  brickId: string;
  partId: string;
  worldPosition: Vec3;
  worldRotation: Quat;
  worldNormal: Vec3;
}

export interface ConnectorPair {
  moving: WorldConnector;
  target: WorldConnector;
}

export const connectorKey = (brickId: string, connectorId: string): string => `${brickId}:${connectorId}`;
