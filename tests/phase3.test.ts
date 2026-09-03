import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  BASIC_BRICK_BUCKET,
  BrickBucket,
  BrickColorRegistry,
  BrickEngine,
  createRectPart,
  createSpecialPartDefinitions,
  createStandardPartDefinitions,
  TECHNIC_BEAM_CATALOG,
  TECHNIC_CONNECTOR_CATALOG,
  LDRAW_PART_CATALOG,
  TECHNIC_PART_CATALOG,
  identity
} from "../src/index.js";
import { createPartIndex, createRuntimePartIndex, searchParts } from "../apps/web/src/editor/parts/part-index.js";
import { recordRecentPart, readRecentParts } from "../apps/web/src/editor/parts/recent-parts.js";
import { normalizeRuntimeGeometryForMobile, PartAssetRegistry } from "../apps/web/src/editor/assets/part-asset-registry.js";
import { createPlacementSession } from "../apps/web/src/editor/placement/placement-session.js";
import { InteractionController } from "../apps/web/src/editor/interaction/interaction-controller.js";
import { createBrickMaterial } from "../apps/web/src/editor/renderer/brick-material.js";
import { createBrickGeometry } from "../apps/web/src/editor/renderer/brick-geometry.js";
import { ThreeBrickRenderer } from "../apps/web/src/editor/renderer/brick-renderer.js";
import type { RuntimePartManifest, RuntimePartsIndexItem } from "../packages/brick-assets/asset-types.js";

const transform = (x = 0, y = 0, z = 0) => ({ position: { x, y, z }, rotation: identity() });

describe("MVP registries and part discovery", () => {
  it("registers the ten discrete colors with explicit opacity", () => {
    const colors = new BrickColorRegistry();
    expect(colors.values()).toHaveLength(10);
    expect(colors.get("red").transparent).toBe(false);
    expect(colors.get("dark-gray").baseColor).toMatch(/^#/);
  });

  it("generates brick, plate, and tile geometry metadata", () => {
    const brick = createRectPart({ id: "brick-test", width: 2, depth: 4, height: "brick" });
    const plate = createRectPart({ id: "plate-test", width: 2, depth: 4, height: "plate" });
    const tile = createRectPart({ id: "tile-test", width: 2, depth: 4, height: "plate", category: "tile", topStuds: false });
    expect(brick.connectors.filter((connector) => connector.type === "stud")).toHaveLength(8);
    expect(plate.dimensions.height).toBe(0.4);
    expect(tile.category).toBe("tile");
    expect(tile.connectors.some((connector) => connector.type === "stud")).toBe(false);
    expect(tile.connectors.filter((connector) => connector.type === "anti_stud")).toHaveLength(8);
    expect(createStandardPartDefinitions()).toHaveLength(40 + technicCatalogLength());
  });

  it("registers legacy procedural parts and all downloaded LDraw parts", () => {
    const parts = createSpecialPartDefinitions();
    expect(parts.slice(0, 3).map((part) => part.id)).toEqual(["wheel-1x1", "flagpole-1x1", "leaf-1x1"]);
    expect(parts).toHaveLength(3 + technicCatalogLength() + LDRAW_PART_CATALOG.length);
    for (const part of parts.slice(0, 3)) {
      expect(part.category).toBe("special");
      expect(part.visual?.kind).toBe(part.id.split("-")[0]);
      expect(part.connectors).toHaveLength(0);
      expect(part.colliders).toHaveLength(1);
    }
    const technicParts = parts.slice(3, 3 + technicCatalogLength());
    expect(technicParts.map((part) => part.id)).toEqual(["technic-axle-4", "technic-beam-5", "technic-beam-7", "technic-pin", "technic-bar-2", "technic-clip"]);
    expect(technicParts[0]?.connectors.filter((connector) => connector.type === "axle")).toHaveLength(2);
    expect(technicParts.find((part) => part.id === "technic-beam-5")?.connectors.filter((connector) => connector.type === "technic_hole")).toHaveLength(10);
    expect(technicParts.find((part) => part.id === "technic-pin")?.connectors.filter((connector) => connector.type === "technic_pin")).toHaveLength(2);
    expect(technicParts.find((part) => part.id === "technic-bar-2")?.connectors.filter((connector) => connector.type === "bar")).toHaveLength(2);
    expect(technicParts.find((part) => part.id === "technic-clip")?.connectors.filter((connector) => connector.type === "clip")).toHaveLength(1);
    for (const part of parts.slice(3 + technicCatalogLength())) {
      expect(part.category).toBe("special");
      expect(part.metadata?.ldrawPartId).toBeTypeOf("string");
      expect(Array.isArray(part.connectors)).toBe(true);
      expect(part.colliders).toHaveLength(1);
      const collider = part.colliders[0];
      if (collider?.type !== "box") throw new Error(`Expected a box collider for ${part.id}`);
      expect(collider.size.x).toBeGreaterThanOrEqual(part.dimensions.width);
      expect(collider.size.y).toBeGreaterThanOrEqual(part.dimensions.height);
      expect(collider.size.z).toBeGreaterThanOrEqual(part.dimensions.depth);
    }
  });

  it("ranks size aliases and Chinese category aliases", () => {
    const index = createPartIndex(createStandardPartDefinitions());
    expect(searchParts("2×4", index)[0]?.id).toBe("brick-2x4");
    expect(searchParts("砖", index).every((item) => item.category === "brick")).toBe(true);
    expect(searchParts("plate", index).every((item) => item.category === "plate")).toBe(true);
    expect(searchParts("车轮", index)[0]?.id).toBe("ldraw-wheel-3482");
    expect(index.filter((item) => item.specialGroup === "technic").map((item) => item.id)).toEqual(expect.arrayContaining(["technic-axle-4", "technic-beam-5", "technic-beam-7", "technic-pin", "technic-bar-2", "technic-clip"]));
  });

  it("separates runtime special parts into independent groups", () => {
    const index = createRuntimePartIndex([
      { id: "wheel", name: "车轮", category: "special", tags: ["special", "wheel"], aliases: [], dimensions: { width: 3, height: 3, depth: 1 }, thumbnail: "/wheel.svg", manifestUrl: "/wheel.json" },
      { id: "leaf", name: "树叶", category: "special", tags: ["special", "plant", "leaf"], aliases: [], dimensions: { width: 2, height: 1, depth: 2 }, thumbnail: "/leaf.svg", manifestUrl: "/leaf.json" }
    ]);
    expect(index.find((item) => item.id === "wheel")?.specialGroup).toBe("wheel");
    expect(index.find((item) => item.id === "leaf")?.specialGroup).toBe("plant");
  });

  it("keeps recent parts deduplicated at the front", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    recordRecentPart("brick-1x1", storage);
    recordRecentPart("plate-2x4", storage);
    expect(recordRecentPart("brick-1x1", storage)).toEqual(["brick-1x1", "plate-2x4"]);
    expect(readRecentParts(storage)).toEqual(["brick-1x1", "plate-2x4"]);
  });
});

const uniqueVertexCount = (geometry: THREE.BufferGeometry): number => {
  const position = geometry.getAttribute("position");
  const vertices = new Set<string>();
  for (let index = 0; index < position.count; index += 1) {
    vertices.add(`${position.getX(index).toFixed(5)},${position.getY(index).toFixed(5)},${position.getZ(index).toFixed(5)}`);
  }
  return vertices.size;
};

const runtimeIndexItem = (id: string, manifestUrl: string): RuntimePartsIndexItem => ({
  id,
  name: id,
  category: "special",
  tags: [],
  aliases: [],
  dimensions: { width: 1, height: 1, depth: 1 },
  thumbnail: "/thumbnail.webp",
  manifestUrl
});

const runtimeManifest = (engine: BrickEngine, id: string): RuntimePartManifest => {
  const part = engine.parts.get(id);
  return {
    id,
    version: 1,
    name: part.name,
    category: part.category,
    source: { sourceType: "ldraw", sourcePartId: id, sourceFile: `${id}.dat` },
    geometry: { lod0: "/leaf.glb", lod1: "/leaf-lod1.glb" },
    dimensions: { ...part.dimensions },
    origin: [part.origin.x, part.origin.y, part.origin.z],
    connectors: part.connectors,
    colliders: part.colliders,
    metadataHash: "metadata",
    geometryHash: "geometry",
    sourceHash: "source",
    assetHash: "asset",
    pipelineVersion: 1,
    thumbnail: "/thumbnail.webp",
    tags: [],
    aliases: [],
    geometryStats: {
      lod0Vertices: 3,
      lod1Vertices: 3,
      lod0Bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      lod1Bounds: { min: [0, 0, 0], max: [1, 1, 1] }
    }
  };
};

const responseFor = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
} as Response);

const technicCatalogLength = (): number => TECHNIC_PART_CATALOG.length + TECHNIC_BEAM_CATALOG.length + TECHNIC_CONNECTOR_CATALOG.length;

describe("MVP bucket and commands", () => {
  it("caches procedural assets for repeated part loads", async () => {
    const engine = new BrickEngine();
    const assets = new PartAssetRegistry(engine.parts);
    const first = assets.getPart("brick-2x4");
    expect(await assets.loadPart("brick-2x4")).toBe(first);
    expect(await assets.preloadPart("plate-2x4")).not.toBe(first);
    assets.dispose();
  });

  it("renders each special part through the procedural fallback", () => {
    const engine = new BrickEngine();
    const assets = new PartAssetRegistry(engine.parts);
    for (const partId of ["wheel-1x1", "flagpole-1x1", "leaf-1x1", "technic-axle-4", "technic-beam-5", "technic-beam-7", "technic-pin", "technic-bar-2", "technic-clip"]) {
      const asset = assets.getPart(partId);
      expect(asset.source).toBe("procedural-fallback");
      expect(asset.geometry.attributes.position?.count).toBeGreaterThan(0);
    }
    const wheel = assets.getPart("ldraw-wheel-3482").geometry;
    const leaf = assets.getPart("ldraw-leaf-7096").geometry;
    wheel.computeBoundingBox();
    leaf.computeBoundingBox();
    const wheelSize = wheel.boundingBox?.getSize(new THREE.Vector3());
    const leafSize = leaf.boundingBox?.getSize(new THREE.Vector3());
    expect(wheelSize?.x).toBeCloseTo(3.1, 2);
    expect(wheelSize?.y).toBeCloseTo(3.1, 2);
    expect(wheelSize?.z).toBeCloseTo(1, 2);
    expect(leafSize?.x).toBeCloseTo(3.91, 2);
    expect(leafSize?.y).toBeCloseTo(1.67, 2);
    expect(leafSize?.z).toBeCloseTo(5.98, 2);
    expect(uniqueVertexCount(wheel)).toBeGreaterThan(8);
    expect(uniqueVertexCount(leaf)).toBeGreaterThan(8);
    assets.dispose();
  });

  it("keeps LDraw special parts recognizable when runtime assets fail to load", async () => {
    const engine = new BrickEngine();
    let shouldFail = true;
    const assets = new PartAssetRegistry(engine.parts, { shouldFailNextLoad: () => {
      const result = shouldFail;
      shouldFail = false;
      return result;
    } });
    for (const partId of ["ldraw-wheel-3482", "ldraw-leaf-7096", "ldraw-claw-15362"]) {
      const part = engine.parts.get(partId);
      expect(createBrickGeometry(part).attributes.position?.count).toBeGreaterThan(24);
      const asset = await assets.loadPart(partId);
      expect(asset.source).toBe("procedural-fallback");
      expect(asset.geometry.attributes.position?.count).toBeGreaterThan(24);
    }
    assets.dispose();
  });

  it("downcasts runtime geometry indices when mobile-compatible", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute([0, 1, 2], 1));
    normalizeRuntimeGeometryForMobile(geometry);
    expect(geometry.getIndex()?.array).toBeInstanceOf(Uint16Array);
    geometry.dispose();
  });

  it("isolates manifest failures and rejects invalid runtime asset identities", async () => {
    const engine = new BrickEngine();
    const wheelId = "ldraw-wheel-3482";
    const leafId = "ldraw-leaf-7096";
    const index: Array<RuntimePartsIndexItem | { id: string; manifestUrl: number }> = [
      runtimeIndexItem(wheelId, "/wheel-manifest.json"),
      runtimeIndexItem(leafId, "/leaf-manifest.json"),
      { id: leafId, manifestUrl: 42 }
    ];
    const leafManifest = runtimeManifest(engine, leafId);
    const wrongManifest = runtimeManifest(engine, "ldraw-claw-15362");
    const runtimeScene = new THREE.Group();
    runtimeScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const loadAsync = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue({ scene: runtimeScene } as unknown as GLTF);
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === "/runtime-index.json") return responseFor(index);
      if (url === "/wheel-manifest.json") return responseFor(wrongManifest);
      if (url === "/leaf-manifest.json") return responseFor(leafManifest);
      return responseFor({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const assets = new PartAssetRegistry(engine.parts, { indexUrl: "/runtime-index.json" });
    try {
      expect((await assets.loadPart(wheelId)).source).toBe("procedural-fallback");
      const leaf = await assets.loadPart(leafId);
      expect(leaf.source).toBe("runtime");
      expect(leaf.part.id).toBe(leafId);
      expect(loadAsync).toHaveBeenCalledWith("/leaf.glb");
    } finally {
      assets.dispose();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("uses double-sided materials for imported geometry", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "material-check", partId: "brick-2x4" });
    const renderer = new ThreeBrickRenderer(new THREE.Group(), engine, 2);
    renderer.syncFromEngine();
    const batch = renderer.batches.get("brick-2x4");
    expect(batch).toBeDefined();
    const batchMaterial = batch?.mesh.material as THREE.MeshPhysicalMaterial;
    expect(batchMaterial).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(batchMaterial.side).toBe(THREE.DoubleSide);
    expect(batchMaterial.metalness).toBe(0);
    expect(batchMaterial.clearcoat).toBeCloseTo(0.12);
    expect(batchMaterial.flatShading).toBe(true);
    expect(batchMaterial.onBeforeCompile).toEqual(expect.any(Function));
    const shader = {
      fragmentShader: "\tvec3 normal = normalize( cross( fdx, fdy ) );"
    } as Parameters<THREE.MeshPhysicalMaterial["onBeforeCompile"]>[0];
    const shaderMaterial = createBrickMaterial();
    shaderMaterial.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("vec3 faceNormal = normalize( cross( fdx, fdy ) );");
    shaderMaterial.dispose();
    expect((renderer.dragProxy.mesh.material as THREE.MeshPhysicalMaterial).side).toBe(THREE.DoubleSide);
    renderer.dispose();
  });

  it("draws the same seeded sequence and keeps the current color", () => {
    const parts = createStandardPartDefinitions();
    const pool = { ...BASIC_BRICK_BUCKET, id: "seeded", seedMode: "seeded" as const };
    const first = new BrickBucket(parts, pool, 42);
    const second = new BrickBucket(parts, pool, 42);
    const firstDraws = Array.from({ length: 20 }, () => first.draw("orange"));
    const secondDraws = Array.from({ length: 20 }, () => second.draw("orange"));
    expect(firstDraws).toEqual(secondDraws);
    expect(firstDraws.every((draw) => draw.colorId === "orange")).toBe(true);
  });

  it("uses weighted categories with bricks appearing more often than tiles", () => {
    const bucket = new BrickBucket(createStandardPartDefinitions(), { ...BASIC_BRICK_BUCKET, seedMode: "seeded" }, 7);
    const counts = { brick: 0, plate: 0, tile: 0 };
    for (let index = 0; index < 500; index += 1) {
      const draw = bucket.draw("red");
      const part = createStandardPartDefinitions().find((candidate) => candidate.id === draw.partId);
      if (part?.category === "brick") counts.brick += 1;
      if (part?.category === "plate") counts.plate += 1;
      if (part?.category === "tile") counts.tile += 1;
    }
    expect(counts.brick).toBeGreaterThan(counts.plate);
    expect(counts.plate).toBeGreaterThan(counts.tile);
  });

  it("changes color through history and adds a placed brick atomically", () => {
    const engine = new BrickEngine();
    const id = engine.createBrick({ id: "color-me", partId: "brick-1x1", colorId: "red", transform: transform() });
    engine.changeBrickColor(id, "blue");
    expect(engine.bricks.get(id).colorId).toBe("blue");
    expect(engine.undo()).toBe(true);
    expect(engine.bricks.get(id).colorId).toBe("red");
    expect(engine.redo()).toBe(true);
    const before = engine.bricks.size;
    const placedId = engine.allocateBrickId();
    engine.addPlacedBrick({ id: placedId, partId: "plate-1x2", colorId: "yellow", transform: transform(3) });
    expect(engine.bricks.size).toBe(before + 1);
    expect(engine.undo()).toBe(true);
    expect(engine.bricks.has(placedId)).toBe(false);
    expect(engine.redo()).toBe(true);
    expect(engine.bricks.has(placedId)).toBe(true);
  });

  it("keeps placement metadata separate from the BrickStore", () => {
    const engine = new BrickEngine();
    const session = createPlacementSession(1, "brick-2x2", "green", "browser");
    expect(session.state).toBe("preview");
    expect(engine.bricks.size).toBe(0);
    expect(engine.history.size).toBe(0);
  });
});

describe("mobile interaction ownership", () => {
  it("uses the touch threshold and cancels brick drag when a second pointer arrives", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "touch-me", partId: "brick-2x4", transform: transform() });
    const parent = new THREE.Group();
    const renderer = new ThreeBrickRenderer(parent, engine, 2);
    renderer.syncFromEngine();
    parent.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 100);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const element = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), addEventListener: vi.fn(), removeEventListener: vi.fn(), releasePointerCapture: vi.fn() } as unknown as HTMLCanvasElement;
    const cameraController = { enabled: true, orbit: vi.fn(), zoom: vi.fn(), focus: vi.fn(), fitProject: vi.fn(), setEnabled: vi.fn((enabled: boolean) => { cameraController.enabled = enabled; }) };
    const interaction = new InteractionController({ engine, renderer, camera, cameraController, element, onSelectionChange: vi.fn(), onHoverChange: vi.fn(), onStateChange: vi.fn(), onDragResult: vi.fn(), onDragPlaneChange: vi.fn(), onMetricsChange: vi.fn(), onHistoryChange: vi.fn() });
    interaction.pointerDown({ pointerId: 1, clientX: 400, clientY: 300, button: 0, pointerType: "touch" });
    interaction.pointerMove({ pointerId: 1, clientX: 410, clientY: 300, button: 0, pointerType: "touch" });
    expect(interaction.getState()).toBe("pressed");
    interaction.pointerMove({ pointerId: 1, clientX: 414, clientY: 300, button: 0, pointerType: "touch" });
    expect(interaction.getState()).toBe("dragging_brick");
    interaction.pointerDown({ pointerId: 2, clientX: 450, clientY: 300, button: 0, pointerType: "touch" });
    expect(interaction.getState()).toBe("orbiting_camera");
    expect(engine.bricks.get("touch-me").transform.position).toEqual({ x: 0, y: 0, z: 0 });
    interaction.pointerUp({ pointerId: 1, clientX: 410, clientY: 300, button: 0, pointerType: "touch" });
    interaction.pointerUp({ pointerId: 2, clientX: 450, clientY: 300, button: 0, pointerType: "touch" });
    expect(interaction.getState()).toBe("idle");
    interaction.dispose();
    renderer.dispose();
  });
});
