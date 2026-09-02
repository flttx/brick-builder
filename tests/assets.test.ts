import { describe, expect, it } from "vitest";
import { ConnectorCompatibilityRegistry, createRectPart, type PartDefinition } from "../src/index.js";
import { addBoxCollider, addConnector, createAuthoringDocument, deleteConnector, parseAuthoringDocument, serializeAuthoringDocument, updateBoxCollider, updateConnector } from "../packages/brick-assets/authoring.js";
import { generateColliders, generateConnectors, generateLDrawConnectors, generateWheelColliders } from "../packages/brick-assets/connector-generator.js";
import { createStandardGeometry, normalizeLDrawGeometry } from "../packages/brick-assets/geometry.js";
import { createGlb, readGlbJson } from "../packages/brick-assets/glb.js";
import { createMapLDrawLibrary, parseLDrawPart, parseLDrawReferences } from "../packages/brick-assets/ldraw-parser.js";
import { loadLDrawSource } from "../packages/brick-assets/ldraw-source.js";
import { canonical } from "../packages/brick-assets/pipeline.js";
import { validateRuntimePartManifest } from "../packages/brick-assets/asset-validation.js";
import type { RuntimePartManifest } from "../packages/brick-assets/asset-types.js";
import { createTechnicAxleDefinition } from "../src/parts/special-part-generator.js";

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

  it("applies LDraw BFC winding and invert-next directives", () => {
    const library = createMapLDrawLibrary({
      "main.dat": "0 BFC CERTIFY CCW\n0 BFC INVERTNEXT\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 sub.dat",
      "sub.dat": "0 BFC CERTIFY CCW\n3 16 0 0 0 20 0 0 0 20 0"
    });
    const mesh = parseLDrawPart("main.dat", library);
    expect(mesh.indices).toEqual([0, 2, 1]);
  });

  it("normalizes Windows separators in LDraw subpart references", () => {
    const mesh = parseLDrawPart("main.dat", createMapLDrawLibrary({
      "main.dat": "1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\sub.dat",
      "s/sub.dat": "3 16 0 0 0 20 0 0 0 20 0"
    }));
    expect(mesh.positions).toHaveLength(9);
    expect(mesh.indices).toEqual([0, 1, 2]);
  });

  it("loads the vendored LDraw dependency closure for downloaded parts", async () => {
    const source = await loadLDrawSource(process.cwd(), "assets-source/ldraw");
    const wheel = normalizeLDrawGeometry(parseLDrawPart("3482c01.dat", source.library), 1 / 20, { alignToGround: true });
    const leaf = normalizeLDrawGeometry(parseLDrawPart("7096.dat", source.library), 1 / 20, { alignToGround: true });
    expect(source.fingerprint).toMatch(/^[a-f0-9]{16}$/u);
    expect(wheel.positions.length).toBeGreaterThan(900);
    expect(leaf.positions.length).toBeGreaterThan(400);
    expect(wheel.bounds.min[1]).toBeCloseTo(-0.6, 4);
    expect(leaf.bounds.min[1]).toBeCloseTo(-0.6, 4);
  });

  it("derives standard and special connectors from real LDraw primitives", async () => {
    const source = await loadLDrawSource(process.cwd(), "assets-source/ldraw");
    const grassMesh = parseLDrawPart("15279.dat", source.library);
    const grassGeometry = normalizeLDrawGeometry(grassMesh, 1 / 20, { alignToGround: true });
    const grassConnectors = generateLDrawConnectors(grassMesh, parseLDrawReferences("15279.dat", source.library));
    expect(grassConnectors).toHaveLength(1);
    expect(grassConnectors[0]?.type).toBe("anti_stud");
    expect(grassConnectors[0]?.position.y).toBeCloseTo(2.4, 2);
    expect(grassConnectors[0]?.normal.y).toBeCloseTo(-1, 5);
    expect(grassConnectors[0]?.position.y).toBeGreaterThanOrEqual(grassGeometry.bounds.min[1]);

    const wheelMesh = parseLDrawPart("3482c01.dat", source.library);
    const wheelConnectors = generateLDrawConnectors(wheelMesh, parseLDrawReferences("3482c01.dat", source.library));
    const axleHoles = wheelConnectors.filter((connector) => connector.type === "axle_hole");
    expect(axleHoles).toHaveLength(2);
    expect(axleHoles.map((connector) => connector.position.z).sort()).toEqual([-0.5, 0.5]);
    expect(axleHoles.every((connector) => connector.position.x === 0)).toBe(true);
    expect(axleHoles.every((connector) => Math.abs(connector.position.y - 0.95) < 1e-6)).toBe(true);
  });

  it("audits connector primitives across the special-part catalog", async () => {
    const source = await loadLDrawSource(process.cwd(), "assets-source/ldraw");
    const expected = [
      ["3482c01.dat", "axle_hole"],
      ["56145c01.dat", "axle_hole"],
      ["56908c01.dat", "technic_hole"],
      ["110100.dat", "technic_hole"],
      ["7877.dat", "axle_hole"],
      ["64711.dat", "technic_hole"],
      ["64712.dat", "technic_hole"],
      ["10884.dat", "clip"],
      ["2335.dat", "clip"],
      ["15362.dat", "axle_hole"],
      ["15362.dat", "axle"]
    ] as const;

    for (const [partId, connectorType] of expected) {
      const mesh = parseLDrawPart(partId, source.library);
      const connectors = generateLDrawConnectors(mesh, parseLDrawReferences(partId, source.library));
      expect(connectors.some((connector) => connector.type === connectorType), `${partId} should expose ${connectorType}`).toBe(true);
    }
  });

  it("keeps special connector types compatible with their counterpart", () => {
    const compatibility = new ConnectorCompatibilityRegistry();
    expect(compatibility.getRule("axle_hole", "axle")?.allow).toBe(true);
    expect(compatibility.getRule("technic_hole", "technic_pin")?.allow).toBe(true);
    expect(compatibility.getRule("clip", "bar")?.allow).toBe(true);
  });

  it("keeps wheel collision geometry open around the real axle hole", async () => {
    const source = await loadLDrawSource(process.cwd(), "assets-source/ldraw");
    const geometry = normalizeLDrawGeometry(parseLDrawPart("3482c01.dat", source.library), 1 / 20, { alignToGround: true });
    const colliders = generateWheelColliders(geometry);
    const center = {
      x: (geometry.bounds.min[0] + geometry.bounds.max[0]) / 2,
      y: (geometry.bounds.min[1] + geometry.bounds.max[1]) / 2,
      z: (geometry.bounds.min[2] + geometry.bounds.max[2]) / 2
    };
    expect(colliders).toHaveLength(4);
    expect(colliders.some((collider) => containsPoint(collider.center, collider.size, center))).toBe(false);
  });

  it("provides a placeable Technic axle target with precise endpoints", () => {
    const axle = createTechnicAxleDefinition({ id: "technic-axle-test", length: 4.8 });
    expect(axle.visual?.kind).toBe("technic_axle");
    expect(axle.connectors.filter((connector) => connector.type === "axle")).toHaveLength(2);
    expect(axle.connectors.every((connector) => connector.compatibilityGroup === "technic-axle")).toBe(true);
    expect(axle.colliders).toHaveLength(5);
  });

  it("supports authored underside connectors for special LDraw parts", async () => {
    const source = await loadLDrawSource(process.cwd(), "assets-source/ldraw");
    const mesh = parseLDrawPart("7096.dat", source.library);
    const connectors = generateLDrawConnectors(mesh, parseLDrawReferences("7096.dat", source.library), undefined, [
      { id: "anti-stud-bottom-0", type: "anti_stud", position: { x: 0, y: 0.186645, z: 1.48885 }, normal: { x: 0, y: 1, z: 0 } },
      { id: "anti-stud-bottom-1", type: "anti_stud", position: { x: 0, y: 0.186645, z: 2.48885 }, normal: { x: 0, y: 1, z: 0 } }
    ]);
    expect(connectors.filter((connector) => connector.type === "anti_stud")).toHaveLength(2);
    expect(connectors.find((connector) => connector.id === "anti-stud-bottom-0")?.position).toEqual({ x: 0, y: 0.186645, z: 1.48885 });
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

const containsPoint = (center: { x: number; y: number; z: number }, size: { x: number; y: number; z: number }, point: { x: number; y: number; z: number }): boolean => Math.abs(point.x - center.x) <= size.x / 2
  && Math.abs(point.y - center.y) <= size.y / 2
  && Math.abs(point.z - center.z) <= size.z / 2;

const createManifest = (): RuntimePartManifest => {
  const definition = part("brick-2x4");
  const geometry = createStandardGeometry(definition, 0);
  const bounds = geometry.bounds;
  return {
    id: "brick-2x4", version: 1, name: "Brick 2x4", category: "brick", source: { sourceType: "procedural", sourcePartId: "brick-2x4", sourceFile: "source.json", license: "CC0" }, geometry: { lod0: "lod0.glb", lod1: "lod1.glb" }, dimensions: definition.dimensions, origin: [0, 0, 0], connectors: definition.connectors, colliders: definition.colliders, metadataHash: canonical(definition.connectors), geometryHash: "geometry", sourceHash: "source", assetHash: "asset", pipelineVersion: 1, thumbnail: "thumb.webp", tags: ["brick"], aliases: ["brick-2x4"], geometryStats: { lod0Vertices: geometry.positions.length / 3, lod1Vertices: geometry.positions.length / 3, lod0Bounds: bounds, lod1Bounds: bounds }
  };
};
