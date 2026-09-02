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
  connectors?: readonly ConnectorDefinition[];
  status?: "official" | "unofficial";
}

export interface TechnicAxleOptions {
  id: string;
  name?: string;
  length?: number;
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
    connectors: [],
    colliders: [{ id: "main", type: "box", center: { x: 0, y: spec.originY, z: 0 }, size: { ...spec.colliderSize } }],
    metadata: { generated: true, specialKind: options.kind, deprecated: true }
  };
};

export const createLDrawPartDefinition = (options: LDrawPartDefinitionOptions): PartDefinition => {
  const originY = -0.6 + options.dimensions.height / 2;
  return {
    id: options.id,
    name: options.name,
    category: "special",
    dimensions: { ...options.dimensions },
    origin: { x: 0, y: originY, z: 0 },
    connectors: options.connectors?.map(cloneConnector) ?? [],
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

export const createTechnicAxleDefinition = (options: TechnicAxleOptions): PartDefinition => {
  const length = options.length ?? 4.8;
  const halfLength = length / 2;
  const supportOffset = Math.max(0.6, halfLength - 1.1);
  return {
    id: options.id,
    name: options.name ?? "Technic 车轴",
    category: "special",
    dimensions: { width: 0.72, height: 1.7, depth: length },
    origin: { x: 0, y: 0.85, z: 0 },
    visual: { kind: "technic_axle" },
    connectors: [
      {
        id: "axle-end-left",
        type: "axle",
        role: "plug",
        position: { x: 0, y: 1.55, z: -halfLength },
        rotation: identity(),
        normal: { x: 0, y: 0, z: -1 },
        compatibilityGroup: "technic-axle",
        snapRadius: 0.3,
        occupiedRule: "single"
      },
      {
        id: "axle-end-right",
        type: "axle",
        role: "plug",
        position: { x: 0, y: 1.55, z: halfLength },
        rotation: identity(),
        normal: { x: 0, y: 0, z: 1 },
        compatibilityGroup: "technic-axle",
        snapRadius: 0.3,
        occupiedRule: "single"
      }
    ],
    colliders: [
      { id: "axle-shaft", type: "box", center: { x: 0, y: 1.55, z: 0 }, size: { x: 0.28, y: 0.28, z: length } },
      { id: "support-left", type: "box", center: { x: 0, y: 0.78, z: -supportOffset }, size: { x: 0.34, y: 1.56, z: 0.34 } },
      { id: "support-right", type: "box", center: { x: 0, y: 0.78, z: supportOffset }, size: { x: 0.34, y: 1.56, z: 0.34 } },
      { id: "base-left", type: "box", center: { x: 0, y: 0.06, z: -supportOffset }, size: { x: 0.72, y: 0.12, z: 0.72 } },
      { id: "base-right", type: "box", center: { x: 0, y: 0.06, z: supportOffset }, size: { x: 0.72, y: 0.12, z: 0.72 } }
    ],
    metadata: { generated: true, specialKind: "technic_axle", technic: true }
  };
};

const cloneConnector = (connector: ConnectorDefinition): ConnectorDefinition => ({
  ...connector,
  position: { ...connector.position },
  rotation: { ...connector.rotation },
  normal: { ...connector.normal }
});
