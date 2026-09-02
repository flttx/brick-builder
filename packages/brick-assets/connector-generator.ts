import { identity } from "../../src/math/quat.js";
import { normalize as normalizeVec3 } from "../../src/math/vec3.js";
import { connectorCompatibilityGroupForType, connectorRoleForType } from "../../src/connectors/connector.js";
import type { ColliderDefinition, ConnectorDefinition, ConnectorType, PartDefinition } from "../../src/index.js";
import { createRectPart } from "../../src/parts/standard-part-generator.js";
import type { ConnectorAddition, NormalizedGeometry, RectPartTemplate } from "./asset-types.js";
import { getLDrawNormalization, type LDrawNormalization, normalizeLDrawPoint } from "./geometry.js";
import type { LDrawMatrix, LDrawMesh, LDrawReference } from "./ldraw-parser.js";

export const generateConnectors = (partId: string, template: RectPartTemplate): ConnectorDefinition[] => createRectPart({
  id: partId,
  width: template.width,
  depth: template.depth,
  height: template.type === "brick" ? "brick" : "plate",
  category: template.type,
  topStuds: template.topStuds,
  bottomSockets: template.bottomSockets
}).connectors;

export const generateColliders = (part: PartDefinition, inset = 0.04): ColliderDefinition[] => [{
  id: "main",
  type: "box",
  center: { ...part.origin },
  size: {
    x: Math.max(0.01, part.dimensions.width - inset),
    y: Math.max(0.01, part.dimensions.height - inset),
    z: Math.max(0.01, part.dimensions.depth - inset)
  }
}];

/** Extracts LDraw connector primitives into gameplay connection points. */
export const generateLDrawConnectors = (
  mesh: LDrawMesh,
  references: readonly LDrawReference[],
  normalization: LDrawNormalization = getLDrawNormalization(mesh, 1 / 20, { alignToGround: true }),
  additions: readonly ConnectorAddition[] = []
): ConnectorDefinition[] => {
  const connectors: ConnectorDefinition[] = [];
  const seen = new Set<string>();
  for (const reference of references) {
    const type = connectorTypeForLDrawReference(reference.fileName);
    if (type === undefined) continue;
    const position = normalizeLDrawPoint(reference.position, normalization);
    // LDraw's reference matrix already carries the primitive's facing direction;
    // applying a second type-based sign would invert socket normals.
    const normal = normalizeVec3(applyLDrawMatrix(reference.matrix, { x: 0, y: 1, z: 0 }));
    if (normal.x === 0 && normal.y === 0 && normal.z === 0) continue;
    const key = `${type}:${Math.round(position.x * 1000)}:${Math.round(position.y * 1000)}:${Math.round(position.z * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const index = connectors.length;
    connectors.push({
      id: `${connectorIdPrefix(type)}-${index}`,
      type,
      role: connectorRoleForType(type),
      position,
      rotation: identity(),
      normal,
      compatibilityGroup: connectorCompatibilityGroupForType(type),
      snapRadius: 0.3,
      occupiedRule: "single"
    });
  }
  for (const addition of additions) {
    if (seen.has(addition.id)) continue;
    const normal = normalizeVec3(addition.normal);
    if (normal.x === 0 && normal.y === 0 && normal.z === 0) continue;
    seen.add(addition.id);
    connectors.push({
      id: addition.id,
      type: addition.type,
      role: connectorRoleForType(addition.type),
      position: { ...addition.position },
      rotation: identity(),
      normal,
      compatibilityGroup: connectorCompatibilityGroupForType(addition.type),
      snapRadius: 0.3,
      occupiedRule: "single"
    });
  }
  return connectors;
};

export const generateGeometryColliders = (geometry: NormalizedGeometry, inset = 0.04): ColliderDefinition[] => {
  const size = {
    x: Math.max(0.01, geometry.bounds.max[0] - geometry.bounds.min[0] - inset),
    y: Math.max(0.01, geometry.bounds.max[1] - geometry.bounds.min[1] - inset),
    z: Math.max(0.01, geometry.bounds.max[2] - geometry.bounds.min[2] - inset)
  };
  return [{
    id: "visual-bounds",
    type: "box",
    center: {
      x: (geometry.bounds.min[0] + geometry.bounds.max[0]) / 2,
      y: (geometry.bounds.min[1] + geometry.bounds.max[1]) / 2,
      z: (geometry.bounds.min[2] + geometry.bounds.max[2]) / 2
    },
    size
  }];
};

export const generateWheelColliders = (geometry: NormalizedGeometry, inset = 0.04): ColliderDefinition[] => {
  const width = Math.max(0.01, geometry.bounds.max[0] - geometry.bounds.min[0] - inset);
  const height = Math.max(0.01, geometry.bounds.max[1] - geometry.bounds.min[1] - inset);
  const depth = Math.max(0.01, geometry.bounds.max[2] - geometry.bounds.min[2] - inset);
  const band = Math.min(Math.max(0.24, Math.min(width, height) * 0.24), Math.min(width, height) / 2);
  const innerHeight = Math.max(0.01, height - band * 2);
  const centerX = (geometry.bounds.min[0] + geometry.bounds.max[0]) / 2;
  const centerY = (geometry.bounds.min[1] + geometry.bounds.max[1]) / 2;
  const centerZ = (geometry.bounds.min[2] + geometry.bounds.max[2]) / 2;
  return [
    { id: "wheel-top", type: "box", center: { x: centerX, y: geometry.bounds.max[1] - band / 2, z: centerZ }, size: { x: width, y: band, z: depth } },
    { id: "wheel-bottom", type: "box", center: { x: centerX, y: geometry.bounds.min[1] + band / 2, z: centerZ }, size: { x: width, y: band, z: depth } },
    { id: "wheel-left", type: "box", center: { x: geometry.bounds.min[0] + band / 2, y: centerY, z: centerZ }, size: { x: band, y: innerHeight, z: depth } },
    { id: "wheel-right", type: "box", center: { x: geometry.bounds.max[0] - band / 2, y: centerY, z: centerZ }, size: { x: band, y: innerHeight, z: depth } }
  ];
};

const connectorTypeForLDrawReference = (fileName: string): ConnectorType | undefined => {
  const baseName = fileName.replaceAll("\\", "/").split("/").pop()?.toLocaleLowerCase();
  if (baseName === undefined) return undefined;
  if (/^(?:axlehol(?:e)?\d*|axl\d*ho(?:l|le|e)?\d*)\.dat$/u.test(baseName)) return "axle_hole";
  if (/^(?:axleend|axlend)[\w-]*\.dat$/u.test(baseName)) return "axle";
  if (/^connhol(?:e)?\d*\.dat$/u.test(baseName)) return "technic_hole";
  if (/^(?:technicpin|pin)[\w-]*\.dat$/u.test(baseName)) return "technic_pin";
  if (/^clip[\w-]*\.dat$/u.test(baseName)) return "clip";
  if (/^bar[\w-]*\.dat$/u.test(baseName)) return "bar";
  if (/^tube[\w-]*\.dat$/u.test(baseName)) return "tube";
  if (/^stud(?:4|4a|4od)\.dat$/u.test(baseName)) return "anti_stud";
  if (/^stud(?:2|2a|3|7|8)\.dat$/u.test(baseName) || baseName === "stud.dat") return "stud";
  return undefined;
};

const connectorIdPrefix = (type: ConnectorType): string => type.replaceAll("_", "-");

const applyLDrawMatrix = (matrix: LDrawMatrix, value: { x: number; y: number; z: number }): { x: number; y: number; z: number } => ({
  x: matrix[0] * value.x + matrix[1] * value.y + matrix[2] * value.z,
  y: matrix[3] * value.x + matrix[4] * value.y + matrix[5] * value.z,
  z: matrix[6] * value.x + matrix[7] * value.y + matrix[8] * value.z
});
