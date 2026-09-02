import type { Quat } from "../math/quat.js";
import type { Vec3 } from "../math/vec3.js";

export type ConnectorType = "stud" | "anti_stud" | "tube" | "technic_pin" | "technic_hole" | "axle" | "axle_hole" | "bar" | "clip";
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

export const connectorRoleForType = (type: ConnectorType): ConnectorRole => {
  if (type === "stud" || type === "technic_pin" || type === "axle" || type === "bar") return "plug";
  if (type === "anti_stud" || type === "tube" || type === "technic_hole" || type === "axle_hole" || type === "clip") return "socket";
  return "neutral";
};

export const connectorCompatibilityGroupForType = (type: ConnectorType): string => {
  if (type === "stud" || type === "anti_stud" || type === "tube") return "standard-stud";
  if (type === "technic_pin" || type === "technic_hole") return "technic-pin";
  if (type === "axle" || type === "axle_hole") return "technic-axle";
  if (type === "bar" || type === "clip") return "bar-clip";
  return "*";
};

export const connectorKey = (brickId: string, connectorId: string): string => `${brickId}:${connectorId}`;
