import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { BrickEngine, GROUND_LEVEL, identity, type ExplicitSnapRequest, type PartDefinition, type PlacementMode, type PrecisionSnapRequest } from "../src/index.js";
import { InteractionController } from "../apps/web/src/editor/interaction/interaction-controller.js";
import { ThreeBrickRenderer } from "../apps/web/src/editor/renderer/brick-renderer.js";
import { findSnapAssist } from "../apps/web/src/editor/interaction/snap-assist.js";
import { createTechnicAxleDefinition } from "../src/parts/special-part-generator.js";

const transform = (x = 0, y = 0, z = 0) => ({ position: { x, y, z }, rotation: identity() });

const explicitRequest = (engine: BrickEngine, movingBrickId: string, movingConnectorId: string, targetBrickId: string, targetConnectorId: string): ExplicitSnapRequest => ({
  movingBrickId,
  movingConnectorId,
  targetBrickId,
  targetConnectorId,
  freeTransform: engine.bricks.get(movingBrickId).transform
});

const precisionRequest = (engine: BrickEngine, movingBrickId: string, targetBrickId: string): PrecisionSnapRequest => ({
  movingBrickId,
  movingConnectorA1Id: "anti-stud-0-0",
  movingConnectorA2Id: "anti-stud-0-1",
  targetBrickId,
  targetConnectorB1Id: "stud-0-0",
  targetConnectorB2Id: "stud-0-1",
  freeTransform: engine.bricks.get(movingBrickId).transform
});

describe("T41.5 placement modes", () => {
  it("offers a real axle target for a wheel axle hole", () => {
    const engine = new BrickEngine();
    engine.parts.upsert(createTechnicAxleDefinition({ id: "technic-axle-test", length: 4.8 }));
    const wheel = engine.parts.get("ldraw-wheel-3482");
    wheel.connectors = [
      { id: "axle-hole-0", type: "axle_hole", role: "socket", position: { x: 0, y: 0.95, z: 0.5 }, rotation: identity(), normal: { x: 0, y: 0, z: -1 }, compatibilityGroup: "technic-axle", snapRadius: 0.3, occupiedRule: "single" }
    ];
    wheel.colliders = [
      { id: "wheel-top", type: "box", center: { x: 0, y: 2, z: 0 }, size: { x: 3, y: 0.6, z: 0.8 } },
      { id: "wheel-bottom", type: "box", center: { x: 0, y: -0.1, z: 0 }, size: { x: 3, y: 0.6, z: 0.8 } },
      { id: "wheel-left", type: "box", center: { x: -1.2, y: 0.95, z: 0 }, size: { x: 0.6, y: 1.5, z: 0.8 } },
      { id: "wheel-right", type: "box", center: { x: 1.2, y: 0.95, z: 0 }, size: { x: 0.6, y: 1.5, z: 0.8 } }
    ];
    engine.parts.upsert(wheel);
    const axleId = engine.createBrick({ id: "axle", partId: "technic-axle-test", transform: transform() });
    const wheelId = engine.createBrick({ id: "wheel", partId: "ldraw-wheel-3482", transform: transform(0, 3, 4) });

    const result = engine.solveExplicitSnap({
      movingBrickId: wheelId,
      movingConnectorId: "axle-hole-0",
      targetBrickId: axleId,
      targetConnectorId: "axle-end-right",
      freeTransform: engine.bricks.get(wheelId).transform
    });

    expect(result.valid).toBe(true);
    expect(result.candidate?.anchorPair.target.id).toBe("axle-end-right");
  });

  it("snaps a Technic pin into a beam hole and a bar into a clip", () => {
    const engine = new BrickEngine();
    const beamId = engine.createBrick({ id: "beam", partId: "technic-beam-5", transform: transform(0, 0.4) });
    const pinId = engine.createBrick({ id: "pin", partId: "technic-pin", transform: transform(4, 3, 4) });
    const pinResult = engine.solveExplicitSnap({
      movingBrickId: pinId,
      movingConnectorId: "technic-pin-left",
      targetBrickId: beamId,
      targetConnectorId: "technic-hole-2-right",
      freeTransform: engine.bricks.get(pinId).transform
    });

    expect(pinResult.valid).toBe(true);
    expect(pinResult.candidate?.anchorPair.target.id).toBe("technic-hole-2-right");

    const clipId = engine.createBrick({ id: "clip", partId: "technic-clip", transform: transform(8, 0.25) });
    const barId = engine.createBrick({ id: "bar", partId: "technic-bar-2", transform: transform(8, 3, 4) });
    const barResult = engine.solveExplicitSnap({
      movingBrickId: barId,
      movingConnectorId: "bar-end-right",
      targetBrickId: clipId,
      targetConnectorId: "clip-jaw",
      freeTransform: engine.bricks.get(barId).transform
    });

    expect(barResult.valid).toBe(true);
    expect(barResult.candidate?.anchorPair.target.id).toBe("clip-jaw");
  });

  it("keeps Auto mode selecting the existing snap candidate", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(0, 4) });

    const result = engine.snap.update({ movingBrickId: moving, freeTransform: transform(0, 1), mode: "auto" });

    expect(result.mode).toBe("snap");
    expect(result.candidate?.matchedPairs).toHaveLength(8);
  });

  it("accepts a forgiving approach to a snap target", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(2, 4) });

    const result = engine.snap.update({ movingBrickId: moving, freeTransform: transform(0.38, 1), mode: "auto" });

    expect(result.mode).toBe("snap");
    expect(result.candidate?.distance).toBeLessThanOrEqual(0.45);
  });

  it("uses the actual connector position when assisting a special part onto a brick", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const specialPart = engine.parts.get("ldraw-grass-15279");
    specialPart.connectors = [{
      id: "anti-stud-0",
      type: "anti_stud",
      role: "socket",
      position: { x: 0, y: -0.6, z: 0.12 },
      rotation: identity(),
      normal: { x: 0, y: -1, z: 0 },
      compatibilityGroup: "standard-stud",
      snapRadius: 0.3,
      occupiedRule: "single"
    }];
    engine.parts.upsert(specialPart);
    const moving = engine.createBrick({ id: "special", partId: "ldraw-grass-15279", transform: transform(3, 4) });

    const assist = findSnapAssist(engine, moving, "base", { x: 0.53, y: 0.6, z: 1.53 }, transform(0.53, 0, 1.41));

    expect(assist).toBeDefined();
    if (assist === undefined) {
      return;
    }
    expect(assist.transform.position).toEqual({ x: 0.5, y: 1.2, z: 1.38 });
    expect(assist.pointerWorld).toEqual({ x: 0.5, y: 0.6, z: 1.5 });
    const result = engine.snap.update({ movingBrickId: moving, freeTransform: assist.transform, pointerWorld: assist.pointerWorld, mode: "auto" });
    expect(result.mode).toBe("snap");
    expect(result.candidate?.anchorPair.target.id).toBe("stud-1-3");
  });

  it("disables Auto Snap in Free mode and commits only at ground height", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(3, 4) });

    engine.beginDrag(moving, "free");
    const nearStud = engine.updateDrag(transform(0, 1), undefined, "free");
    expect(nearStud.mode).toBe("free");
    expect(nearStud.candidate).toBeUndefined();
    const result = engine.updateDrag(transform(3, 1), undefined, "free");

    expect(result.mode).toBe("free");
    expect(result.candidate).toBeUndefined();
    expect(result.transform.position.y).toBe(GROUND_LEVEL);
    engine.commitDrag();
    expect(engine.bricks.get(moving).transform.position.y).toBe(GROUND_LEVEL);
    expect(engine.graph.size).toBe(0);
  });

  it("commits a legal ground move when Auto has no snap candidate", () => {
    const engine = new BrickEngine();
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(3) });

    engine.beginDrag(moving, "auto");
    const result = engine.updateDrag(transform(1, -3, 2), undefined, "auto");

    expect(result.mode).toBe("free");
    expect(result.valid).toBe(true);
    engine.commitDrag();

    expect(engine.bricks.get(moving).transform.position).toEqual({ x: 1, y: GROUND_LEVEL, z: 2 });
  });

  it("does not offer or validate snap placements below the ground", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(0, -1) });

    expect(engine.snap.solve({ movingBrickId: moving, freeTransform: transform(0, -1), mode: "auto" })).toBeUndefined();
    const validation = engine.placement.validate({ brickId: moving, transform: transform(0, -0.01) });
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain("below_ground");
  });

  it("rejects an incompatible explicit connector pair", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(3, 4) });

    const result = engine.solveExplicitSnap(explicitRequest(engine, moving, "stud-0-0", "base", "stud-0-0"));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("connector_incompatible");
  });

  it("rejects an occupied target connector", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transform() });
    engine.createBrick({ id: "occupant", partId: "brick-1x1", transform: transform(0, 1.2) });
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(3, 4) });
    engine.connect({
      id: "occupied",
      brickA: "base",
      brickB: "occupant",
      type: "rigid",
      pairs: [{ connectorA: "stud-0-0", connectorB: "anti-stud-0-0" }]
    });

    const result = engine.solveExplicitSnap(explicitRequest(engine, moving, "anti-stud-0-0", "base", "stud-0-0"));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("connector_occupied");
  });

  it("rejects an explicit pair whose solved transform collides", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    engine.createBrick({ id: "blocker", partId: "brick-2x4", transform: transform(0, 1.2) });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const result = engine.solveExplicitSnap(explicitRequest(engine, moving, "anti-stud-0-0", "base", "stud-0-0"));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("collision");
    expect(result.collision.valid).toBe(false);
  });

  it("solves a valid explicit connector pair with all eight matched pairs", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const result = engine.solveExplicitSnap(explicitRequest(engine, moving, "anti-stud-0-0", "base", "stud-0-0"));

    expect(result.valid).toBe(true);
    expect(result.transform?.position).toEqual({ x: 0, y: 1.2, z: 0 });
    expect(result.matchedPairs).toHaveLength(8);
    expect(result.candidate?.anchorPair.moving.id).toBe("anti-stud-0-0");
    expect(result.candidate?.anchorPair.target.id).toBe("stud-0-0");
  });

  it("does not mutate Engine, graph, or history while previewing or cancelling Precision", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });
    const beforeSnapshot = engine.getSnapshot();
    const beforeHistory = engine.history.size;

    const preview = engine.solveExplicitSnap(explicitRequest(engine, moving, "anti-stud-0-0", "base", "stud-0-0"));

    expect(preview.valid).toBe(true);
    expect(engine.getSnapshot()).toEqual(beforeSnapshot);
    expect(engine.graph.size).toBe(0);
    expect(engine.history.size).toBe(beforeHistory);
  });

  it("confirms Precision as one ConnectionGroup and supports undo", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const result = engine.commitExplicitSnap(explicitRequest(engine, moving, "anti-stud-0-0", "base", "stud-0-0"));

    expect(result.matchedPairs).toHaveLength(8);
    expect(engine.graph.size).toBe(1);
    expect(engine.graph.values()[0]?.pairs).toHaveLength(8);
    expect(engine.validateEngineConsistency()).toEqual({ valid: true, errors: [] });
    expect(engine.undo()).toBe(true);
    expect(engine.graph.size).toBe(0);
    expect(engine.bricks.get(moving).transform.position).toEqual({ x: 3, y: 4, z: 0 });
  });

  it("solves Precision from two connector pairs and previews eight matched pairs", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const result = engine.solvePrecisionSnap(precisionRequest(engine, moving, "base"));

    expect(result.valid).toBe(true);
    expect(result.transform?.position).toEqual({ x: 0, y: 1.2, z: 0 });
    expect(result.matchedPairs).toHaveLength(8);
    expect(engine.graph.size).toBe(0);
    expect(engine.history.size).toBe(2);
  });

  it("rejects a precision direction that would place the brick below ground", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const result = engine.solvePrecisionSnap({
      movingBrickId: moving,
      movingConnectorA1Id: "stud-0-0",
      movingConnectorA2Id: "stud-0-1",
      targetBrickId: "base",
      targetConnectorB1Id: "anti-stud-0-0",
      targetConnectorB2Id: "anti-stud-0-1",
      freeTransform: engine.bricks.get(moving).transform
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("below_ground");
  });

  it("requires opposite connector types for precision pairs", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const result = engine.solvePrecisionSnap({
      ...precisionRequest(engine, moving, "base"),
      targetConnectorB1Id: "anti-stud-0-0",
      targetConnectorB2Id: "anti-stud-0-1"
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("connector_incompatible");
  });

  it("rejects a precision pair whose second connector normal is not opposite", () => {
    const engine = new BrickEngine();
    const connectors = (prefix: string, secondNormal: { x: number; y: number; z: number }): PartDefinition["connectors"] => [
      { id: `anti-${prefix}-a1`, type: "anti_stud", role: "socket", position: { x: 0, y: 0, z: 0 }, rotation: identity(), normal: { x: 0, y: -1, z: 0 }, compatibilityGroup: "standard-stud", snapRadius: 0.3, occupiedRule: "single" },
      { id: `stud-${prefix}-a2`, type: "stud", role: "plug", position: { x: 1, y: 0, z: 0 }, rotation: identity(), normal: secondNormal, compatibilityGroup: "standard-stud", snapRadius: 0.3, occupiedRule: "single" }
    ];
    const makePart = (id: string, partConnectors: PartDefinition["connectors"]): PartDefinition => ({
      id,
      name: id,
      category: "special",
      dimensions: { width: 1, height: 1, depth: 1 },
      origin: { x: 0, y: 0, z: 0 },
      connectors: partConnectors,
      colliders: [{ id: "main", type: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 0.1, y: 0.1, z: 0.1 } }]
    });
    engine.parts.register(makePart("precision-source", connectors("source", { x: 0, y: 1, z: 0 })));
    engine.parts.register(makePart("precision-target", [
      { id: "stud-target-b1", type: "stud", role: "plug", position: { x: 0, y: 0, z: 0 }, rotation: identity(), normal: { x: 0, y: 1, z: 0 }, compatibilityGroup: "standard-stud", snapRadius: 0.3, occupiedRule: "single" },
      { id: "anti-target-b2", type: "anti_stud", role: "socket", position: { x: 1, y: 0, z: 0 }, rotation: identity(), normal: { x: 0, y: 1, z: 0 }, compatibilityGroup: "standard-stud", snapRadius: 0.3, occupiedRule: "single" }
    ]));
    const target = engine.createBrick({ id: "precision-target", partId: "precision-target", transform: transform(0, 3) });
    const moving = engine.createBrick({ id: "precision-source", partId: "precision-source", transform: transform(4, 4) });

    const result = engine.solvePrecisionSnap({
      movingBrickId: moving,
      movingConnectorA1Id: "anti-source-a1",
      movingConnectorA2Id: "stud-source-a2",
      targetBrickId: target,
      targetConnectorB1Id: "stud-target-b1",
      targetConnectorB2Id: "anti-target-b2",
      freeTransform: engine.bricks.get(moving).transform
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("connector_incompatible");
  });

  it("rejects duplicate connector selections and mismatched connector spacing", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(3, 4) });

    const duplicate = engine.solvePrecisionSnap({ ...precisionRequest(engine, moving, "base"), movingConnectorA2Id: "anti-stud-0-0" });
    const mismatch = engine.solvePrecisionSnap({ ...precisionRequest(engine, moving, "base"), targetConnectorB2Id: "stud-0-2" });

    expect(duplicate.reason).toBe("duplicate_connector");
    expect(mismatch.reason).toBe("distance_mismatch");
  });

  it("pushes a colliding free drag out to the nearest legal position", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-1x1", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(3) });

    engine.beginDrag(moving, "free");
    const result = engine.updateDrag(transform(0.1), undefined, "free");

    expect(result.valid).toBe(true);
    expect(result.collision.valid).toBe(true);
    expect(result.transform.position.x).toBeGreaterThan(0.9);
    engine.cancelDrag();
  });

  it("keeps placement mode out of the versioned project snapshot", () => {
    const engine = new BrickEngine();
    const moving = engine.createBrick({ id: "moving", partId: "brick-1x1", transform: transform(3, 4) });
    const modes: PlacementMode[] = ["auto", "free", "precision"];
    for (const mode of modes) {
      engine.beginDrag(moving, mode);
      expect(engine.getDragSession().placementMode).toBe(mode);
      engine.cancelDrag();
      expect(JSON.stringify(engine.getSnapshot())).not.toContain(mode);
    }
  });
});

describe("T41.5 temporary Alt mode", () => {
  it("switches a live Auto drag to Free and restores Auto on key release", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "drag-me", partId: "brick-2x4", transform: transform() });
    const parent = new THREE.Group();
    const renderer = new ThreeBrickRenderer(parent, engine, 2);
    renderer.syncFromEngine();
    parent.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 100);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const element = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), addEventListener: vi.fn(), removeEventListener: vi.fn(), releasePointerCapture: vi.fn() } as unknown as HTMLCanvasElement;
    const cameraController = { enabled: true, orbit: vi.fn(), zoom: vi.fn(), focus: vi.fn(), fitProject: vi.fn(), move: vi.fn(), setEnabled: vi.fn((enabled: boolean) => { cameraController.enabled = enabled; }) };
    const keyboardListeners = new Map<string, (event: KeyboardEvent) => void>();
    const keyboard = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => keyboardListeners.set(type, listener as (event: KeyboardEvent) => void),
      removeEventListener: (type: string) => keyboardListeners.delete(type)
    } as unknown as Document;
    const interaction = new InteractionController({ engine, renderer, camera, cameraController, element, onSelectionChange: vi.fn(), onHoverChange: vi.fn(), onStateChange: vi.fn(), onDragResult: vi.fn(), onDragPlaneChange: vi.fn(), onMetricsChange: vi.fn(), onHistoryChange: vi.fn() });
    const removeKeyboard = interaction.attachKeyboard(keyboard);

    const preventDefault = vi.fn();
    keyboardListeners.get("keydown")?.({ key: "w", repeat: false, preventDefault } as unknown as KeyboardEvent);
    keyboardListeners.get("keydown")?.({ key: "d", repeat: true, preventDefault } as unknown as KeyboardEvent);
    expect(cameraController.move).not.toHaveBeenCalled();
    interaction.update(0.1);
    expect(cameraController.move).toHaveBeenCalledWith(expect.closeTo(2.0316, 4), expect.closeTo(2.0316, 4));
    expect(preventDefault).toHaveBeenCalled();
    keyboardListeners.get("keyup")?.({ key: "w" } as unknown as KeyboardEvent);
    keyboardListeners.get("keyup")?.({ key: "d" } as unknown as KeyboardEvent);

    interaction.pointerDown({ pointerId: 1, clientX: 400, clientY: 300, button: 0 });
    interaction.pointerMove({ pointerId: 1, clientX: 420, clientY: 300, button: 0 });
    keyboardListeners.get("keydown")?.({ key: "Alt", repeat: false } as KeyboardEvent);
    expect(engine.getDragSession().placementMode).toBe("free");
    keyboardListeners.get("keyup")?.({ key: "Alt" } as KeyboardEvent);
    expect(engine.getDragSession().placementMode).toBe("auto");

    interaction.pointerCancel({ pointerId: 1, clientX: 420, clientY: 300, button: 0 });
    removeKeyboard();
    interaction.dispose();
    renderer.dispose();
  });
});
