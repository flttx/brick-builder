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

export interface TechnicBeamOptions {
  id: string;
  name?: string;
  holes: number;
}

export interface TechnicPinOptions {
  id: string;
  name?: string;
}

export interface TechnicBarOptions {
  id: string;
  name?: string;
  length?: number;
}

export interface TechnicClipOptions {
  id: string;
  name?: string;
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

export const createTechnicBeamDefinition = (options: TechnicBeamOptions): PartDefinition => {
  if (!Number.isInteger(options.holes) || options.holes < 1) {
    throw new Error("Technic beam holes must be a positive integer");
  }
  const width = 1;
  const height = 0.8;
  const length = options.holes;
  const halfLength = length / 2;
  const holeClearance = 0.36;
  const holeCenters = Array.from({ length: options.holes }, (_, index) => index - (options.holes - 1) / 2);
  const colliders: PartDefinition["colliders"] = [];
  for (let index = 0; index <= holeCenters.length; index += 1) {
    const start = index === 0 ? -halfLength : (holeCenters[index - 1] ?? -halfLength) + holeClearance / 2;
    const end = index === holeCenters.length ? halfLength : (holeCenters[index] ?? halfLength) - holeClearance / 2;
    const segmentLength = end - start;
    if (segmentLength <= 0.01) continue;
    colliders.push({
      id: `beam-body-${index}`,
      type: "box",
      center: { x: 0, y: 0, z: (start + end) / 2 },
      size: { x: width - 0.06, y: height - 0.06, z: segmentLength }
    });
  }
  const connectors = holeCenters.flatMap((z, index) => [
    createTechnicConnector(`technic-hole-${index}-left`, "technic_hole", { x: -width / 2, y: 0, z }, { x: -1, y: 0, z: 0 }),
    createTechnicConnector(`technic-hole-${index}-right`, "technic_hole", { x: width / 2, y: 0, z }, { x: 1, y: 0, z: 0 })
  ]);
  return {
    id: options.id,
    name: options.name ?? `Technic 梁 ${options.holes}L`,
    category: "special",
    dimensions: { width, height, depth: length },
    origin: { x: 0, y: 0, z: 0 },
    visual: { kind: "technic_beam" },
    connectors,
    colliders,
    metadata: { generated: true, specialKind: "technic_beam", technic: true, holes: options.holes }
  };
};

export const createTechnicPinDefinition = (options: TechnicPinOptions): PartDefinition => ({
  id: options.id,
  name: options.name ?? "Technic Pin",
  category: "special",
  dimensions: { width: 1.6, height: 0.36, depth: 0.36 },
  origin: { x: 0, y: 0, z: 0 },
  visual: { kind: "technic_pin" },
  connectors: [
    createTechnicConnector("technic-pin-left", "technic_pin", { x: -0.8, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }),
    createTechnicConnector("technic-pin-right", "technic_pin", { x: 0.8, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
  ],
  colliders: [{ id: "pin-body", type: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 1.5, y: 0.3, z: 0.3 } }],
  metadata: { generated: true, specialKind: "technic_pin", technic: true }
});

export const createTechnicBarDefinition = (options: TechnicBarOptions): PartDefinition => {
  const length = options.length ?? 2.4;
  const halfLength = length / 2;
  return {
    id: options.id,
    name: options.name ?? "Technic Bar 2L",
    category: "special",
    dimensions: { width: 0.28, height: 0.28, depth: length },
    origin: { x: 0, y: 0, z: 0 },
    visual: { kind: "technic_bar" },
    connectors: [
      createTechnicConnector("bar-end-left", "bar", { x: 0, y: 0, z: -halfLength }, { x: 0, y: 0, z: -1 }, "bar-clip"),
      createTechnicConnector("bar-end-right", "bar", { x: 0, y: 0, z: halfLength }, { x: 0, y: 0, z: 1 }, "bar-clip")
    ],
    colliders: [{ id: "bar-body", type: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 0.24, y: 0.24, z: length } }],
    metadata: { generated: true, specialKind: "technic_bar", technic: true, length }
  };
};

export const createTechnicClipDefinition = (options: TechnicClipOptions): PartDefinition => ({
  id: options.id,
  name: options.name ?? "Technic Clip",
  category: "special",
  dimensions: { width: 0.8, height: 0.6, depth: 0.8 },
  origin: { x: 0, y: 0, z: 0 },
  visual: { kind: "technic_clip" },
  connectors: [createTechnicConnector("clip-jaw", "clip", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "bar-clip")],
  colliders: [{ id: "clip-body", type: "box", center: { x: 0, y: 0, z: 0.28 }, size: { x: 0.7, y: 0.5, z: 0.22 } }],
  metadata: { generated: true, specialKind: "technic_clip", technic: true }
});

const createTechnicConnector = (
  id: string,
  type: ConnectorDefinition["type"],
  position: ConnectorDefinition["position"],
  normal: ConnectorDefinition["normal"],
  compatibilityGroup = "technic-pin"
): ConnectorDefinition => ({
  id,
  type,
  role: type === "clip" ? "socket" : type === "bar" || type === "technic_pin" ? "plug" : "socket",
  position,
  rotation: identity(),
  normal,
  compatibilityGroup,
  snapRadius: 0.3,
  occupiedRule: "single"
});

const cloneConnector = (connector: ConnectorDefinition): ConnectorDefinition => ({
  ...connector,
  position: { ...connector.position },
  rotation: { ...connector.rotation },
  normal: { ...connector.normal }
});
