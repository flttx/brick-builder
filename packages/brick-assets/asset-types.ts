import type { ColliderDefinition, ConnectorDefinition, PartCategory, PartDefinition } from "../../src/index.js";

export type AssetSourceType = "ldraw" | "procedural";

export interface PartSourceManifest {
  sourceType: AssetSourceType;
  sourcePartId: string;
  sourceFile: string;
  sourceRoot?: string;
  sourceVersion?: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
}

export interface RectPartTemplate {
  type: "brick" | "plate" | "tile";
  width: number;
  depth: number;
  topStuds: boolean;
  bottomSockets: boolean;
}

export interface ConnectorAddition {
  id: string;
  type: ConnectorDefinition["type"];
  position: ConnectorDefinition["position"];
  normal: ConnectorDefinition["normal"];
}

export interface PartSourceRecord {
  id: string;
  name: string;
  category: PartCategory;
  source: PartSourceManifest;
  template: RectPartTemplate;
  connectorAdditions?: ConnectorAddition[];
  tags: string[];
  aliases: string[];
}

export interface NormalizedGeometry {
  positions: number[];
  normals: number[];
  indices: number[];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface RuntimePartManifest {
  id: string;
  version: number;
  name: string;
  category: PartCategory;
  source: PartSourceManifest;
  geometry: {
    lod0: string;
    lod1: string;
    lod2?: string;
  };
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  origin: [number, number, number];
  connectors: ConnectorDefinition[];
  colliders: ColliderDefinition[];
  metadataHash: string;
  geometryHash: string;
  sourceHash: string;
  assetHash: string;
  pipelineVersion: number;
  thumbnail: string;
  tags: string[];
  aliases: string[];
  geometryStats: {
    lod0Vertices: number;
    lod1Vertices: number;
    lod0Bounds: NormalizedGeometry["bounds"];
    lod1Bounds: NormalizedGeometry["bounds"];
  };
}

export interface RuntimePartsIndexItem {
  id: string;
  name: string;
  category: PartCategory;
  tags: string[];
  aliases: string[];
  dimensions: RuntimePartManifest["dimensions"];
  thumbnail: string;
  manifestUrl: string;
}

export interface RuntimeAssetPackManifest {
  assetPackVersion: number;
  pipelineVersion: number;
  generatedAt: string;
  parts: Array<{
    id: string;
    manifestUrl: string;
    geometryHash: string;
    metadataHash: string;
  }>;
}

export const partDefinitionFromRuntimeManifest = (manifest: RuntimePartManifest): PartDefinition => ({
  id: manifest.id,
  name: manifest.name,
  category: manifest.category,
  dimensions: { ...manifest.dimensions },
  origin: { x: manifest.origin[0], y: manifest.origin[1], z: manifest.origin[2] },
  connectors: manifest.connectors.map((connector) => ({
    ...connector,
    position: { ...connector.position },
    rotation: { ...connector.rotation },
    normal: { ...connector.normal }
  })),
  colliders: manifest.colliders.map((collider) => ({
    ...collider,
    center: { ...collider.center },
    size: { ...collider.size }
  })),
  version: manifest.version,
  asset: {
    glb: manifest.geometry.lod0,
    lod0: manifest.geometry.lod0,
    lod1: manifest.geometry.lod1,
    manifestUrl: `/assets/asset-pack/parts/${manifest.id}/${manifest.assetHash}/manifest.json`,
    geometryHash: manifest.geometryHash,
    metadataHash: manifest.metadataHash
  },
  metadata: {
    source: { ...manifest.source },
    pipelineVersion: manifest.pipelineVersion,
    thumbnail: manifest.thumbnail
  }
});

export const isRuntimePartManifest = (value: unknown): value is RuntimePartManifest => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RuntimePartManifest>;
  return typeof candidate.id === "string"
    && typeof candidate.version === "number"
    && typeof candidate.name === "string"
    && typeof candidate.geometry === "object"
    && candidate.geometry !== null
    && typeof candidate.geometry.lod0 === "string"
    && typeof candidate.geometry.lod1 === "string"
    && Array.isArray(candidate.connectors)
    && Array.isArray(candidate.colliders)
    && typeof candidate.metadataHash === "string"
    && typeof candidate.geometryHash === "string";
};
