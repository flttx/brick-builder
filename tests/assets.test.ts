import { describe, expect, it } from "vitest";
import { createRectPart, type PartDefinition } from "../src/index.js";
import { addBoxCollider, addConnector, createAuthoringDocument, deleteConnector, parseAuthoringDocument, serializeAuthoringDocument, updateBoxCollider, updateConnector } from "../packages/brick-assets/authoring.js";
import { generateColliders, generateConnectors } from "../packages/brick-assets/connector-generator.js";
import { createStandardGeometry, normalizeLDrawGeometry } from "../packages/brick-assets/geometry.js";
import { createGlb, readGlbJson } from "../packages/brick-assets/glb.js";
import { createMapLDrawLibrary, parseLDrawPart } from "../packages/brick-assets/ldraw-parser.js";
import { canonical } from "../packages/brick-assets/pipeline.js";
import { validateRuntimePartManifest } from "../packages/brick-assets/asset-validation.js";
import type { RuntimePartManifest } from "../packages/brick-assets/asset-types.js";

const part = (id = "brick-test"): PartDefinition => createRectPart({ id, width: 2, depth: 4, height: "brick", name: "Brick Test" });

describe("asset industrialization", () => {
  it("parses LDraw triangles, quads, and subpart transforms", () => {
    const library = createMapLDrawLibrary({
      "main.dat": "1 16 20 0 0 1 0 0 0 1 0 0 0 1 sub.dat",
      "sub.dat": "4 16 0 0 0 20 0 0 20 20 0 0 20 0"
    });
    const mesh = parseLDrawPart("main.dat", library);
    const normalized = normalizeLDrawGeometry(mesh);
    expect(normalized.positions).toEqual([1, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0]);
    expect(normalized.indices).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("keeps Game Part ID separate from generated connector metadata", () => {
    const definition = part("brick-2x4");
    const connectors = generateConnectors("brick-2x4", { type: "brick", width: 2, depth: 4, topStuds: true, bottomSockets: true });
    expect(definition.id).toBe("brick-2x4");
    expect(connectors).toHaveLength(16);
    expect(connectors[0]?.id).toContain("stud");
  });

  it("generates tile metadata without top studs and uses an independent box collider", () => {
    const tile = createRectPart({ id: "tile-2x2", width: 2, depth: 2, height: "plate", category: "tile", topStuds: false });
    const connectors = generateConnectors("tile-2x2", { type: "tile", width: 2, depth: 2, topStuds: false, bottomSockets: true });
    const colliders = generateColliders(tile);
    expect(connectors.filter((connector) => connector.type === "stud")).toHaveLength(0);
    expect(colliders[0]?.type).toBe("box");
    expect(colliders[0]?.size.x).toBeLessThan(tile.dimensions.width);
  });

  it("creates deterministic LOD GLBs and preserves bounds in the runtime schema", () => {
    const definition = part();
    const lod0 = createStandardGeometry(definition, 0);
    const lod1 = createStandardGeometry(definition, 1);
    const first = createGlb(lod0);
    const second = createGlb(lod0);
    expect(first.equals(second)).toBe(true);
    const json = readGlbJson(first);
    expect(json.asset).toBeDefined();
    expect(lod1.positions.length).toBeLessThan(lod0.positions.length);
  });

  it("supports authoring metadata round trips and grid movement", () => {
    const manifest = createManifest();
    const initial = createAuthoringDocument(manifest);
    const withConnector = addConnector(initial, "stud");
    const connectorId = withConnector.connectors.at(-1)?.id;
    if (connectorId === undefined) throw new Error("Connector was not added");
    const moved = updateConnector(withConnector, connectorId, { position: { x: 0.14, y: 0.26, z: 0.34 } });
    expect(moved.connectors.at(-1)?.position).toEqual({ x: 0.1, y: 0.3, z: 0.3 });
    const withCollider = addBoxCollider(moved);
    const colliderId = withCollider.colliders.at(-1)?.id;
    if (colliderId === undefined) throw new Error("Collider was not added");
    const resized = updateBoxCollider(withCollider, colliderId, { size: { x: 0.04, y: 1.04, z: 1.04 } });
    const restored = parseAuthoringDocument(JSON.parse(serializeAuthoringDocument(resized)) as unknown);
    expect(restored?.connectors.at(-1)?.position).toEqual({ x: 0.1, y: 0.3, z: 0.3 });
    expect(restored?.colliders.at(-1)?.size.x).toBe(0.1);
    expect(deleteConnector(restored as typeof resized, connectorId).connectors.some((connector) => connector.id === connectorId)).toBe(false);
  });

  it("catches invalid connector and bounds metadata before export", () => {
    const manifest = createManifest();
    manifest.connectors[0] = { ...manifest.connectors[0] as NonNullable<typeof manifest.connectors[0]>, id: manifest.connectors[1]?.id ?? "duplicate" };
    manifest.geometryStats.lod0Bounds.max[0] = 10;
    const issues = validateRuntimePartManifest(manifest);
    expect(issues.some((issue) => issue.code === "connector_id")).toBe(true);
    expect(issues.some((issue) => issue.code === "bounds")).toBe(true);
  });
});

const createManifest = (): RuntimePartManifest => {
  const definition = part("brick-2x4");
  const geometry = createStandardGeometry(definition, 0);
  const bounds = geometry.bounds;
  return {
    id: "brick-2x4", version: 1, name: "Brick 2x4", category: "brick", source: { sourceType: "procedural", sourcePartId: "brick-2x4", sourceFile: "source.json", license: "CC0" }, geometry: { lod0: "lod0.glb", lod1: "lod1.glb" }, dimensions: definition.dimensions, origin: [0, 0, 0], connectors: definition.connectors, colliders: definition.colliders, metadataHash: canonical(definition.connectors), geometryHash: "geometry", sourceHash: "source", assetHash: "asset", pipelineVersion: 1, thumbnail: "thumb.webp", tags: ["brick"], aliases: ["brick-2x4"], geometryStats: { lod0Vertices: geometry.positions.length / 3, lod1Vertices: geometry.positions.length / 3, lod0Bounds: bounds, lod1Bounds: bounds }
  };
};
