import type { ColliderDefinition } from "../collision/collider-definition.js";
import type { Vec3 } from "../math/vec3.js";
import type { ConnectorDefinition } from "../connectors/connector.js";

export type PartCategory = "brick" | "plate" | "tile" | "slope" | "technic" | "special";
export type ProceduralPartVisual = "wheel" | "flagpole" | "leaf";

export interface PartDefinition {
  id: string;
  name: string;
  category: PartCategory;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  connectors: ConnectorDefinition[];
  colliders: ColliderDefinition[];
  origin: Vec3;
  visual?: {
    kind: ProceduralPartVisual;
  };
  version?: number;
  asset?: {
    glb: string;
    lod0?: string;
    lod1?: string;
    manifestUrl?: string;
    geometryHash?: string;
    metadataHash?: string;
  };
  metadata?: Record<string, unknown>;
}

export const createMissingPartDefinition = (id: string): PartDefinition => ({
  id,
  name: `Missing part ${id}`,
  category: "special",
  dimensions: { width: 1, height: 1, depth: 1 },
  origin: { x: 0, y: 0, z: 0 },
  connectors: [],
  colliders: [{ id: "missing-part-collider", type: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }],
  metadata: { missingAsset: true }
});
