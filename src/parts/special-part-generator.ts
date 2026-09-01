import { identity } from "../math/quat.js";
import type { ConnectorDefinition } from "../connectors/connector.js";
import type { PartDefinition } from "./part-definition.js";

export type SpecialPartKind = "wheel" | "flagpole" | "leaf";

export interface SpecialPartOptions {
  id: string;
  kind: SpecialPartKind;
  name?: string;
}

export interface LDrawPartDefinitionOptions {
  id: string;
  name: string;
  ldrawPartId: string;
  dimensions: { width: number; height: number; depth: number };
  status?: "official" | "unofficial";
}

interface SpecialPartSpec {
  name: string;
  width: number;
  height: number;
  depth: number;
  originY: number;
  colliderSize: { x: number; y: number; z: number };
}

const SPECIAL_PART_SPECS: Record<SpecialPartKind, SpecialPartSpec> = {
  wheel: { name: "车轮", width: 1.2, height: 1.2, depth: 0.56, originY: 0, colliderSize: { x: 1.16, y: 1.16, z: 0.52 } },
  flagpole: { name: "旗杆", width: 1.2, height: 3.2, depth: 1, originY: 1, colliderSize: { x: 1.08, y: 3.12, z: 0.9 } },
  leaf: { name: "树叶", width: 1.5, height: 1.2, depth: 0.9, originY: 0, colliderSize: { x: 1.42, y: 1.12, z: 0.82 } }
};

export const createSpecialPartDefinition = (options: SpecialPartOptions): PartDefinition => {
  const spec = SPECIAL_PART_SPECS[options.kind];
  return {
    id: options.id,
    name: options.name ?? spec.name,
    category: "special",
    dimensions: { width: spec.width, height: spec.height, depth: spec.depth },
    origin: { x: 0, y: spec.originY, z: 0 },
    visual: { kind: options.kind },
    connectors: [createSpecialConnector("anti-stud-0-0", "anti_stud", spec.originY - spec.height / 2), createSpecialConnector("stud-0-0", "stud", spec.originY + spec.height / 2)],
    colliders: [{ id: "main", type: "box", center: { x: 0, y: spec.originY, z: 0 }, size: { ...spec.colliderSize } }],
    metadata: { generated: true, specialKind: options.kind, deprecated: true }
  };
};

export const createLDrawPartDefinition = (options: LDrawPartDefinitionOptions): PartDefinition => {
  const bottomY = -0.6;
  const topY = bottomY + options.dimensions.height;
  const originY = (bottomY + topY) / 2;
  return {
    id: options.id,
    name: options.name,
    category: "special",
    dimensions: { ...options.dimensions },
    origin: { x: 0, y: originY, z: 0 },
    connectors: [
      createSpecialConnector("anti-stud-0-0", "anti_stud", bottomY),
      createSpecialConnector("stud-0-0", "stud", topY)
    ],
    colliders: [{
      id: "main",
      type: "box",
      center: { x: 0, y: originY, z: 0 },
      size: {
        x: options.dimensions.width,
        y: options.dimensions.height,
        z: options.dimensions.depth
      }
    }],
    metadata: {
      ldrawPartId: options.ldrawPartId,
      assetStatus: options.status ?? "official"
    }
  };
};

const createSpecialConnector = (id: string, type: ConnectorDefinition["type"], y: number): ConnectorDefinition => ({
  id,
  type,
  role: type === "stud" ? "plug" : "socket",
  position: { x: 0, y, z: 0 },
  rotation: identity(),
  normal: type === "stud" ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 },
  compatibilityGroup: "standard-stud",
  snapRadius: 0.3,
  occupiedRule: "single"
});
