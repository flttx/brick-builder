import type { RuntimePartManifest } from "./asset-types.js";

export interface AssetValidationIssue {
  partId: string;
  code: string;
  message: string;
}

export interface AssetValidationReport {
  valid: boolean;
  checkedParts: number;
  issues: AssetValidationIssue[];
}

export const validateRuntimePartManifest = (manifest: RuntimePartManifest): AssetValidationIssue[] => {
  const issues: AssetValidationIssue[] = [];
  const issue = (code: string, message: string): void => { issues.push({ partId: manifest.id, code, message }); };
  if (manifest.id.length === 0 || manifest.name.length === 0) issue("identity", "Part id and name are required");
  if (manifest.source.sourceFile.length === 0 || manifest.source.sourcePartId.length === 0) issue("source", "Source file and source part id are required");
  if (manifest.source.license === undefined || manifest.source.license.length === 0) issue("license", "Source license is required");
  if (manifest.geometry.lod0.length === 0 || manifest.geometry.lod1.length === 0) issue("lod", "LOD0 and LOD1 are required");
  if (manifest.thumbnail.length === 0) issue("thumbnail", "Thumbnail is required");
  if (!manifest.dimensions.width || !manifest.dimensions.height || !manifest.dimensions.depth) issue("dimensions", "Dimensions must be positive");
  if (!manifest.geometryStats.lod0Vertices || !manifest.geometryStats.lod1Vertices) issue("geometry", "Geometry must contain vertices");
  if (!finiteTuple(manifest.origin)) issue("origin", "Origin must be finite");
  const connectorIds = new Set<string>();
  for (const connector of manifest.connectors) {
    if (connectorIds.has(connector.id)) issue("connector_id", `Duplicate connector id ${connector.id}`);
    connectorIds.add(connector.id);
    if (!finiteTuple([connector.position.x, connector.position.y, connector.position.z])) issue("connector_position", `Connector ${connector.id} has invalid position`);
    if (connector.compatibilityGroup.length === 0) issue("connector_group", `Connector ${connector.id} has no compatibility group`);
  }
  const colliderIds = new Set<string>();
  for (const collider of manifest.colliders) {
    if (colliderIds.has(collider.id)) issue("collider_id", `Duplicate collider id ${collider.id}`);
    colliderIds.add(collider.id);
    if (collider.type !== "box" || !finiteTuple([collider.center.x, collider.center.y, collider.center.z, collider.size.x, collider.size.y, collider.size.z]) || collider.size.x <= 0 || collider.size.y <= 0 || collider.size.z <= 0) issue("collider", `Collider ${collider.id} is invalid`);
  }
  const studs = manifest.connectors.filter((connector) => connector.type === "stud").length;
  const antiStuds = manifest.connectors.filter((connector) => connector.type === "anti_stud").length;
  const expected = manifest.dimensions.width * manifest.dimensions.depth;
  if (manifest.category === "tile" && studs !== 0) issue("semantics", "Tile must have zero top studs");
  if (manifest.category !== "tile" && studs !== expected) issue("semantics", `Expected ${expected} studs, found ${studs}`);
  if (antiStuds !== expected) issue("semantics", `Expected ${expected} anti-studs, found ${antiStuds}`);
  if (!boundsMatchDimensions(manifest.geometryStats.lod0Bounds, manifest.dimensions)) issue("bounds", "LOD0 visual bounds do not match metadata dimensions");
  if (!boundsMatchDimensions(manifest.geometryStats.lod1Bounds, manifest.dimensions)) issue("bounds", "LOD1 visual bounds do not match metadata dimensions");
  return issues;
};

export const validateRuntimePartManifests = (manifests: RuntimePartManifest[]): AssetValidationReport => {
  const issues: AssetValidationIssue[] = [];
  const ids = new Set<string>();
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) issues.push({ partId: manifest.id, code: "duplicate_part", message: `Duplicate part id ${manifest.id}` });
    ids.add(manifest.id);
    issues.push(...validateRuntimePartManifest(manifest));
  }
  return { valid: issues.length === 0, checkedParts: manifests.length, issues };
};

const finiteTuple = (values: number[]): boolean => values.every((value) => Number.isFinite(value));
const boundsMatchDimensions = (bounds: { min: [number, number, number]; max: [number, number, number] }, dimensions: { width: number; height: number; depth: number }): boolean => {
  const actual = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  const expected = [dimensions.width, dimensions.height, dimensions.depth];
  return actual.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= 0.25);
};
