import { fromAxisAngle, identity } from "../../src/math/quat.js";
import type { ColliderDefinition, ConnectorDefinition, Quat, Vec3 } from "../../src/index.js";
import type { RuntimePartManifest } from "./asset-types.js";

export interface AuthoringDocument {
  version: 1;
  partId: string;
  baseMetadataHash: string;
  connectors: ConnectorDefinition[];
  colliders: ColliderDefinition[];
}

export type ConnectorPreset = "stud" | "anti_stud";

export const createAuthoringDocument = (manifest: RuntimePartManifest): AuthoringDocument => ({
  version: 1,
  partId: manifest.id,
  baseMetadataHash: manifest.metadataHash,
  connectors: cloneConnectors(manifest.connectors),
  colliders: cloneColliders(manifest.colliders)
});

export const addConnector = (document: AuthoringDocument, preset: ConnectorPreset): AuthoringDocument => {
  const source = document.connectors.find((connector) => connector.type === preset) ?? document.connectors[0];
  const index = document.connectors.filter((connector) => connector.type === preset).length + 1;
  const connector: ConnectorDefinition = {
    id: `manual-${preset}-${index}`,
    type: preset,
    role: preset === "stud" ? "plug" : "socket",
    position: source === undefined ? { x: 0, y: 0, z: 0 } : { ...source.position },
    rotation: source === undefined ? identity() : { ...source.rotation },
    normal: source === undefined ? { x: 0, y: preset === "stud" ? 1 : -1, z: 0 } : { ...source.normal },
    compatibilityGroup: "standard-stud",
    snapRadius: 0.3,
    occupiedRule: "single"
  };
  return { ...document, connectors: [...document.connectors, connector] };
};

export const updateConnector = (document: AuthoringDocument, connectorId: string, update: { position?: Vec3; rotation?: Quat }): AuthoringDocument => ({
  ...document,
  connectors: document.connectors.map((connector) => connector.id !== connectorId ? connector : {
    ...connector,
    ...(update.position === undefined ? {} : { position: snapVec3(update.position, 0.1) }),
    ...(update.rotation === undefined ? {} : { rotation: { ...update.rotation } })
  })
});

export const rotateConnector = (document: AuthoringDocument, connectorId: string, quarterTurns: number): AuthoringDocument => updateConnector(document, connectorId, { rotation: fromAxisAngle({ x: 0, y: 1, z: 0 }, quarterTurns * Math.PI / 2) });

export const deleteConnector = (document: AuthoringDocument, connectorId: string): AuthoringDocument => ({ ...document, connectors: document.connectors.filter((connector) => connector.id !== connectorId) });

export const duplicateConnector = (document: AuthoringDocument, connectorId: string): AuthoringDocument => {
  const source = document.connectors.find((connector) => connector.id === connectorId);
  if (source === undefined) return document;
  const duplicate = { ...source, id: `${source.id}-copy`, position: { ...source.position }, rotation: { ...source.rotation }, normal: { ...source.normal } };
  return { ...document, connectors: [...document.connectors, duplicate] };
};

export const addBoxCollider = (document: AuthoringDocument): AuthoringDocument => {
  const index = document.colliders.length + 1;
  const collider: ColliderDefinition = { id: `manual-box-${index}`, type: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } };
  return { ...document, colliders: [...document.colliders, collider] };
};

export const updateBoxCollider = (document: AuthoringDocument, colliderId: string, update: { center?: Vec3; size?: Vec3 }): AuthoringDocument => ({
  ...document,
  colliders: document.colliders.map((collider) => collider.id !== colliderId ? collider : {
    ...collider,
    ...(update.center === undefined ? {} : { center: snapVec3(update.center, 0.1) }),
    ...(update.size === undefined ? {} : { size: { x: Math.max(0.1, snapValue(update.size.x, 0.1)), y: Math.max(0.1, snapValue(update.size.y, 0.1)), z: Math.max(0.1, snapValue(update.size.z, 0.1)) } })
  })
});

export const deleteCollider = (document: AuthoringDocument, colliderId: string): AuthoringDocument => ({ ...document, colliders: document.colliders.filter((collider) => collider.id !== colliderId) });

export const serializeAuthoringDocument = (document: AuthoringDocument): string => `${JSON.stringify(document, null, 2)}\n`;

export const parseAuthoringDocument = (value: unknown): AuthoringDocument | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<AuthoringDocument>;
  if (candidate.version !== 1 || typeof candidate.partId !== "string" || typeof candidate.baseMetadataHash !== "string" || !Array.isArray(candidate.connectors) || !Array.isArray(candidate.colliders)) return undefined;
  return { version: 1, partId: candidate.partId, baseMetadataHash: candidate.baseMetadataHash, connectors: cloneConnectors(candidate.connectors as ConnectorDefinition[]), colliders: cloneColliders(candidate.colliders as ColliderDefinition[]) };
};

export const snapValue = (value: number, grid: number): number => Number((Math.round(value / grid) * grid).toFixed(6));

const snapVec3 = (value: Vec3, grid: number): Vec3 => ({ x: snapValue(value.x, grid), y: snapValue(value.y, grid), z: snapValue(value.z, grid) });
const cloneConnectors = (connectors: ConnectorDefinition[]): ConnectorDefinition[] => connectors.map((connector) => ({ ...connector, position: { ...connector.position }, rotation: { ...connector.rotation }, normal: { ...connector.normal } }));
const cloneColliders = (colliders: ColliderDefinition[]): ColliderDefinition[] => colliders.map((collider) => ({ ...collider, center: { ...collider.center }, size: { ...collider.size } }));
