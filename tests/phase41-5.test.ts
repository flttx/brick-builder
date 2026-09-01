import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { BrickEngine, identity, type ExplicitSnapRequest, type PlacementMode } from "../src/index.js";
import { InteractionController } from "../apps/web/src/editor/interaction/interaction-controller.js";
import { ThreeBrickRenderer } from "../apps/web/src/editor/renderer/brick-renderer.js";

const transform = (x = 0, y = 0, z = 0) => ({ position: { x, y, z }, rotation: identity() });

const explicitRequest = (engine: BrickEngine, movingBrickId: string, movingConnectorId: string, targetBrickId: string, targetConnectorId: string): ExplicitSnapRequest => ({
  movingBrickId,
  movingConnectorId,
  targetBrickId,
  targetConnectorId,
  freeTransform: engine.bricks.get(movingBrickId).transform
});

describe("T41.5 placement modes", () => {
  it("keeps Auto mode selecting the existing snap candidate", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const moving = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(0, 4) });

    const result = engine.snap.update({ movingBrickId: moving, freeTransform: transform(0, 1), mode: "auto" });

    expect(result.mode).toBe("snap");
    expect(result.candidate?.matchedPairs).toHaveLength(8);
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
    expect(result.transform.position.y).toBe(0);
    engine.commitDrag();
    expect(engine.bricks.get(moving).transform.position.y).toBe(0);
    expect(engine.graph.size).toBe(0);
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
    const cameraController = { enabled: true, orbit: vi.fn(), zoom: vi.fn(), focus: vi.fn(), fitProject: vi.fn(), setEnabled: vi.fn((enabled: boolean) => { cameraController.enabled = enabled; }) };
    const keyboardListeners = new Map<string, (event: KeyboardEvent) => void>();
    const keyboard = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => keyboardListeners.set(type, listener as (event: KeyboardEvent) => void),
      removeEventListener: (type: string) => keyboardListeners.delete(type)
    } as unknown as Document;
    const interaction = new InteractionController({ engine, renderer, camera, cameraController, element, onSelectionChange: vi.fn(), onHoverChange: vi.fn(), onStateChange: vi.fn(), onDragResult: vi.fn(), onDragPlaneChange: vi.fn(), onMetricsChange: vi.fn(), onHistoryChange: vi.fn() });
    const removeKeyboard = interaction.attachKeyboard(keyboard);

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
