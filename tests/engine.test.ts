import { describe, expect, it } from "vitest";
import {
  BrickEngine,
  ConnectionGraph,
  ConnectorSpatialIndex,
  createStandardBrickDefinition,
  solveSnapTransform,
  PartRegistry,
  SpatialHash,
  axisRotationQuarter,
  vec3,
  yRotationQuarter
} from "../src/index.js";

const transformAt = (x: number, y: number, z: number, quarterTurns = 0) => ({
  position: vec3(x, y, z),
  rotation: yRotationQuarter(quarterTurns)
});

describe("standard parts and spatial indexes", () => {
  it("generates the standard 2x4 connection geometry", () => {
    const definition = createStandardBrickDefinition({ id: "test-2x4", width: 2, depth: 4 });
    expect(definition.connectors.filter((connector) => connector.type === "stud")).toHaveLength(8);
    expect(definition.connectors.filter((connector) => connector.type === "anti_stud")).toHaveLength(8);
    expect(definition.colliders[0]?.size).toEqual({ x: 1.96, y: 1.16, z: 3.96 });
  });

  it("handles negative coordinates, boundaries, move and delete in a spatial hash", () => {
    const hash = new SpatialHash<string>(1);
    hash.insert({ id: "negative", position: vec3(-1, 0, 0), value: "negative" });
    hash.insert({ id: "boundary", position: vec3(0, 0, 0), value: "boundary" });
    expect(hash.query(vec3(-1, 0, 0), 0).map((entry) => entry.value)).toEqual(["negative"]);
    expect(hash.query(vec3(0, 0, 0), 0, "boundary")).toEqual([]);
    hash.update({ id: "negative", position: vec3(4, 0, 0), value: "moved" });
    expect(hash.query(vec3(-1, 0, 0), 0.1)).toEqual([]);
    expect(hash.query(vec3(4, 0, 0), 0).map((entry) => entry.value)).toEqual(["moved"]);
    expect(hash.remove("boundary")).toBe(true);
  });

  it("does not return connectors belonging to the moving brick", () => {
    const index = new ConnectorSpatialIndex();
    const connector = {
      id: "stud-0-0",
      type: "stud" as const,
      role: "plug" as const,
      position: vec3(0, 0, 0),
      rotation: yRotationQuarter(0),
      normal: vec3(0, 1, 0),
      compatibilityGroup: "standard-stud",
      snapRadius: 0.3,
      occupiedRule: "single" as const,
      brickId: "moving",
      partId: "brick-1x1",
      worldPosition: vec3(0, 0, 0),
      worldRotation: yRotationQuarter(0),
      worldNormal: vec3(0, 1, 0)
    };
    index.insert(connector);
    expect(index.query(vec3(0, 0, 0), 1, "moving")).toEqual([]);
  });
});

describe("snap, collision and placement", () => {
  it("finds a full 2x4 stack with eight matched pairs", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transformAt(0, 1, 0) });
    const candidate = engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 1, 0), mode: "auto" });
    expect(candidate).toBeDefined();
    expect(candidate?.matchedPairs).toHaveLength(8);
    expect(candidate?.transform.position).toEqual({ x: 0, y: 1.2, z: 0 });
  });

  it("rejects a stud/anti-stud pair when the connector normals face the same way", () => {
    const engine = new BrickEngine();
    const movingPart = engine.parts.get("brick-1x1");
    const movingConnector = movingPart.connectors.find((connector) => connector.type === "stud");
    const rule = engine.connectors.compatibility.getRule("stud", "anti_stud");
    if (movingConnector === undefined || rule === undefined) {
      throw new Error("Expected standard stud compatibility");
    }
    const target = {
      ...movingConnector,
      id: "target-anti",
      type: "anti_stud" as const,
      normal: vec3(0, 1, 0),
      brickId: "target",
      partId: "brick-1x1",
      worldPosition: vec3(0, 0, 0),
      worldRotation: yRotationQuarter(0),
      worldNormal: vec3(0, 1, 0)
    };
    expect(solveSnapTransform({
      movingConnector,
      targetConnector: target,
      currentRotation: yRotationQuarter(0),
      compatibility: rule
    })).toBeNull();
  });

  it("finds a partial multi-stud match and rejects distant or wrong-type anchors", () => {
    const parts = new PartRegistry();
    parts.register(createStandardBrickDefinition({ id: "brick-1x4", width: 1, depth: 4 }));
    const engine = new BrickEngine({ parts });
    engine.createBrick({ id: "base", partId: "brick-1x4", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transformAt(0.5, 1, 1) });
    const candidates = engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0.5, 1, 1), mode: "auto" });
    expect(candidates?.matchedPairs.length).toBeGreaterThan(0);
    expect(candidates?.matchedPairs.length).toBeLessThan(8);
    expect(engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 10, 0), mode: "auto" })).toBeUndefined();
    const wrongDirection = engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, -0.6, 0), mode: "auto" });
    expect(wrongDirection).toBeUndefined();
  });

  it("deduplicates equivalent anchor transforms and blocks a third colliding brick", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transformAt(0, 1, 0) });
    const candidates = engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 1, 0), mode: "auto" });
    expect(candidates?.matchedPairs).toHaveLength(8);
    engine.createBrick({ id: "blocker", partId: "brick-2x4", transform: transformAt(0, 1.2, 0) });
    expect(engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 1, 0), mode: "auto" })).toBeUndefined();
  });

  it("excludes an occupied target connector while keeping other connectors available", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transformAt(0, 0, 0) });
    engine.createBrick({ id: "occupant", partId: "brick-1x1", transform: transformAt(0, 1.2, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transformAt(0, 2, 0) });
    engine.connect({
      id: "occupied-group",
      brickA: "base",
      brickB: "occupant",
      type: "rigid",
      pairs: [{ connectorA: "stud-0-0", connectorB: "anti-stud-0-0" }]
    });
    engine.spatial.removeBrick("occupant");
    engine.brickSpatial.removeBrick("occupant");
    expect(engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 1, 0), mode: "auto" })).toBeUndefined();
    expect(engine.occupancy.isOccupied("base", "stud-0-0")).toBe(true);
    expect(engine.occupancy.isOccupied("base", "anti-stud-0-0")).toBe(false);
  });

  it("uses enter/exit hysteresis and previous-candidate stability", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transformAt(0, 2, 0) });
    const first = engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 1, 0), mode: "auto" });
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error("Expected an initial snap candidate");
    }
    expect(engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 0.74, 0), mode: "auto" })).toBeUndefined();
    const held = engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 0.74, 0), previousCandidate: first, mode: "auto" });
    expect(held?.stable).toBe(true);
    expect(engine.snap.solve({ movingBrickId: movingId, freeTransform: transformAt(0, 0.67, 0), previousCandidate: first, mode: "auto" })).toBeUndefined();
  });
});

describe("connections, drag, commands and snapshot", () => {
  it("supports vertical quarter-turns and commits them as valid grid rotations", () => {
    const engine = new BrickEngine();
    const brickId = engine.createBrick({ id: "vertical", partId: "brick-1x1", transform: transformAt(0, 0, 0) });
    engine.rotateBrick(brickId, 1, "x");
    expect(engine.bricks.get(brickId).transform.rotation.x).toBeCloseTo(axisRotationQuarter("x", 1).x);
    expect(engine.bricks.get(brickId).transform.rotation.w).toBeCloseTo(axisRotationQuarter("x", 1).w);

    engine.beginDrag(brickId, "free");
    const result = engine.updateDrag({ position: vec3(0, 0, 0), rotation: axisRotationQuarter("x", 1) });
    expect(result.valid).toBe(true);
    engine.commitDrag();
    expect(engine.bricks.get(brickId).transform.rotation.x).toBeCloseTo(axisRotationQuarter("x", 1).x);
    expect(engine.bricks.get(brickId).transform.rotation.w).toBeCloseTo(axisRotationQuarter("x", 1).w);
  });

  it("keeps a vertically rotated brick above the ground during a free drag", () => {
    const engine = new BrickEngine();
    const brickId = engine.createBrick({ id: "vertical-wide", partId: "brick-2x4", transform: transformAt(0, 0, 0) });

    engine.rotateBrick(brickId, 1, "x");
    const rotated = engine.bricks.get(brickId).transform;
    expect(rotated.position.y).toBeCloseTo(1.4);

    engine.beginDrag(brickId, "free");
    const result = engine.updateDrag({ position: vec3(3, -20, 2), rotation: rotated.rotation }, undefined, "free");
    expect(result.valid).toBe(true);
    expect(result.transform.position).toEqual({ x: 3, y: 1.4, z: 2 });

    engine.commitDrag();
    expect(engine.bricks.get(brickId).transform.position).toEqual({ x: 3, y: 1.4, z: 2 });
  });

  it("computes connected components with BFS", () => {
    const graph = new ConnectionGraph();
    graph.add({ id: "ab", brickA: "a", brickB: "b", type: "rigid", pairs: [{ connectorA: "x", connectorB: "y" }] });
    graph.add({ id: "bc", brickA: "b", brickB: "c", type: "rigid", pairs: [{ connectorA: "x", connectorB: "y" }] });
    expect(graph.getConnectedComponent("a")).toEqual(["a", "b", "c"]);
    graph.remove("bc");
    expect(graph.getConnectedComponent("a")).toEqual(["a", "b"]);
  });

  it("reports graph and occupancy corruption through the consistency validator", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "a", partId: "brick-1x1", transform: transformAt(0, 0, 0) });
    engine.createBrick({ id: "b", partId: "brick-1x1", transform: transformAt(0, 1.2, 0) });
    engine.graph.add({ id: "broken", brickA: "a", brickB: "missing", type: "rigid", pairs: [{ connectorA: "stud-0-0", connectorB: "stud-0-0" }] });
    const result = engine.validateEngineConsistency();
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("missing brick"))).toBe(true);
  });

  it("treats collider contact as valid and penetration as invalid", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transformAt(0, 3, 0) });
    const touching = engine.collision.checkBrick(engine.bricks.get(movingId), transformAt(0, 1.16, 0));
    expect(touching.valid).toBe(true);
    expect(touching.status).toBe("touching");
    const penetrating = engine.collision.checkBrick(engine.bricks.get(movingId), transformAt(0, 1, 0));
    expect(penetrating.valid).toBe(false);
    expect(penetrating.status).toBe("penetrating");
  });

  it("commits a single drag command, then undo and redo the complete connection", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transformAt(0, 4, 0) });
    engine.beginDrag(movingId);
    const result = engine.updateDrag(transformAt(0, 1, 0));
    expect(result.mode).toBe("snap");
    expect(result.candidate?.matchedPairs).toHaveLength(8);
    engine.commitDrag();
    expect(engine.graph.size).toBe(1);
    expect(engine.occupancy.records()).toHaveLength(16);
    expect(engine.history.size).toBe(3);
    expect(engine.undo()).toBe(true);
    expect(engine.graph.size).toBe(0);
    expect(engine.bricks.get(movingId).transform.position).toEqual({ x: 0, y: 4, z: 0 });
    expect(engine.redo()).toBe(true);
    expect(engine.graph.size).toBe(1);
    expect(engine.validateEngineConsistency()).toEqual({ valid: true, errors: [] });
  });

  it("detaches a connected brick only after threshold and restores it on cancel", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transformAt(0, 4, 0) });
    engine.beginDrag(movingId);
    engine.updateDrag(transformAt(0, 1, 0));
    engine.commitDrag();
    expect(engine.graph.size).toBe(1);
    engine.beginDrag(movingId);
    engine.updateDrag(transformAt(0, 1.1, 0));
    expect(engine.graph.size).toBe(1);
    engine.updateDrag(transformAt(0, 3, 0));
    expect(engine.graph.size).toBe(0);
    engine.cancelDrag();
    expect(engine.bricks.get(movingId).transform.position).toEqual({ x: 0, y: 1.2, z: 0 });
    expect(engine.graph.size).toBe(1);
    expect(engine.validateEngineConsistency().valid).toBe(true);
  });

  it("deletes all derived connection state and restores it through undo", () => {
    const engine = new BrickEngine();
    const a = engine.createBrick({ id: "a", partId: "brick-1x1", transform: transformAt(0, 0, 0) });
    const b = engine.createBrick({ id: "b", partId: "brick-1x1", transform: transformAt(0, 1.2, 0) });
    engine.beginDrag(b);
    engine.updateDrag(transformAt(0, 0.9, 0));
    engine.commitDrag();
    expect(engine.graph.size).toBe(1);
    engine.deleteBrick(a);
    expect(engine.bricks.has(a)).toBe(false);
    expect(engine.graph.size).toBe(0);
    expect(engine.undo()).toBe(true);
    expect(engine.bricks.has(a)).toBe(true);
    expect(engine.graph.size).toBe(1);
    expect(engine.validateEngineConsistency().valid).toBe(true);
  });

  it("round trips a versioned snapshot without runtime caches", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", colorId: "red", transform: transformAt(0, 0, 0) });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-1x1", colorId: "blue", transform: transformAt(0, 1, 0) });
    engine.beginDrag(movingId);
    engine.updateDrag(transformAt(0, 0.95, 0));
    engine.commitDrag();
    const snapshot = engine.getSnapshot();
    expect(snapshot.version).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("spatial");
    const loaded = new BrickEngine();
    loaded.loadSnapshot(snapshot);
    expect(loaded.getSnapshot()).toEqual(snapshot);
    expect(loaded.validateEngineConsistency().valid).toBe(true);
  });
});
