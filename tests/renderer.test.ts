import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { BrickEngine } from "../src/index.js";
import { identity } from "../src/math/quat.js";
import { ThreeCameraController } from "../apps/web/src/editor/camera/camera-controller.js";
import { InteractionController } from "../apps/web/src/editor/interaction/interaction-controller.js";
import { BrickPicker } from "../apps/web/src/editor/interaction/picker.js";
import { DragProxy } from "../apps/web/src/editor/renderer/drag-proxy.js";
import { ThreeBrickRenderer } from "../apps/web/src/editor/renderer/brick-renderer.js";
import { RenderBatch } from "../apps/web/src/editor/renderer/render-batch.js";

const transform = (x = 0, y = 0, z = 0) => ({ position: { x, y, z }, rotation: identity() });

describe("RenderBatch", () => {
  it("keeps bidirectional identity and recycles instance slots", () => {
    const parent = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const batch = new RenderBatch({ parent, geometry, capacity: 2 });

    batch.add("blue", transform(-1), "#2f79c5");
    batch.add("red", transform(1), "#d84b43");
    const blueSlot = batch.brickToInstance.get("blue");
    expect(blueSlot).toBeDefined();
    expect(batch.instanceToBrick.get(blueSlot as number)).toBe("blue");

    expect(batch.remove("blue")).toBe(true);
    batch.add("green", transform(), "#91a9ac");
    expect(batch.brickToInstance.get("green")).toBe(blueSlot);
    batch.updateMatrix("green", transform(0, 2));
    batch.updateColor("green", "#ffffff");
    batch.setHidden("green", true);
    batch.setHidden("green", false);

    batch.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("allocates and recycles fixed-size chunks without changing pick identity", () => {
    const parent = new THREE.Group();
    const batch = new RenderBatch({ parent, geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 2 });
    batch.add("a", transform(), "#ffffff");
    batch.add("b", transform(1), "#ffffff");
    batch.add("c", transform(2), "#ffffff");
    expect(batch.chunkCount).toBe(2);
    const cSlot = batch.brickToInstance.get("c");
    expect(cSlot).toBeDefined();
    expect(batch.getBrickIdForMesh(batch.meshes[1] as THREE.InstancedMesh, cSlot as number % 2)).toBe("c");
    expect(batch.remove("c")).toBe(true);
    expect(batch.chunkCount).toBe(1);
    batch.add("d", transform(3), "#ffffff");
    expect(batch.chunkCount).toBe(2);
    batch.dispose();
  });
});

describe("renderer and picking", () => {
  it("maps an InstancedMesh intersection back to the engine brick", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "pick-me", partId: "brick-2x4", colorId: "blue", transform: transform() });
    const parent = new THREE.Group();
    const renderer = new ThreeBrickRenderer(parent, engine, 4);
    renderer.syncFromEngine();
    const batch = renderer.batches.get("brick-2x4");
    expect(batch).toBeDefined();

    const intersection = {
      object: batch?.mesh,
      instanceId: batch?.brickToInstance.get("pick-me"),
      distance: 0,
      point: new THREE.Vector3()
    } as unknown as THREE.Intersection;
    expect(renderer.getBrickIdFromIntersection(intersection)).toBe("pick-me");
    expect(renderer.getInstanceCount()).toBe(1);
    renderer.beginDrag("pick-me");
    expect(renderer.dragProxy.mesh.visible).toBe(true);
    renderer.endDrag();
    expect(renderer.dragProxy.mesh.visible).toBe(false);
    renderer.dispose();
  });

  it("raycasts only the pickable brick batch", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "pick-me", partId: "brick-2x4", transform: transform() });
    const parent = new THREE.Group();
    const renderer = new ThreeBrickRenderer(parent, engine, 2);
    renderer.syncFromEngine();
    parent.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 100);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const element = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLElement;
    const picker = new BrickPicker(renderer, element);

    expect(picker.pick(400, 300, camera)?.brickId).toBe("pick-me");
    renderer.dispose();
  });

  it("syncs batch matrices after an Engine placement undo and redo", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "base", partId: "brick-2x4", transform: transform() });
    const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: transform(0, 4) });
    const parent = new THREE.Group();
    const renderer = new ThreeBrickRenderer(parent, engine, 4);
    renderer.syncFromEngine();
    engine.beginDrag(movingId);
    engine.updateDrag(transform(0, 1));
    engine.commitDrag();
    renderer.syncFromEngine();

    const batch = renderer.batches.get("brick-2x4");
    const slot = batch?.brickToInstance.get(movingId);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    if (batch === undefined || slot === undefined) {
      throw new Error("Expected moving brick instance");
    }
    batch.mesh.getMatrixAt(slot, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.y).toBeCloseTo(1.2);

    expect(engine.undo()).toBe(true);
    renderer.syncFromEngine();
    batch.mesh.getMatrixAt(slot, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.y).toBeCloseTo(4);

    expect(engine.redo()).toBe(true);
    renderer.syncFromEngine();
    batch.mesh.getMatrixAt(slot, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.y).toBeCloseTo(1.2);
    renderer.dispose();
  });
});

describe("camera and interaction state", () => {
  it("orbits through the camera controller and keeps the target stable while zooming", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "focus-me", transform: transform(3, 0, 0) });
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const controls = { enabled: true, target: new THREE.Vector3(), update: vi.fn() };
    const controller = new ThreeCameraController(engine);
    controller.attach(camera, controls);
    const initialDistance = camera.position.distanceTo(controls.target);
    controller.zoom(-0.2);
    expect(camera.position.distanceTo(controls.target)).toBeLessThan(initialDistance);
    controller.focus("focus-me");
    expect(controls.target.x).toBe(3);
    controller.fitProject();
    expect(controls.update).toHaveBeenCalled();
  });

  it("moves the camera on the ground plane relative to its view", () => {
    const engine = new BrickEngine();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const controls = { enabled: true, target: new THREE.Vector3(), update: vi.fn() };
    const controller = new ThreeCameraController(engine);
    controller.attach(camera, controls);
    const initialPosition = camera.position.clone();
    controller.move(1, 0);
    expect(camera.position.z).toBeLessThan(initialPosition.z);
    expect(controls.target.z).toBeLessThan(0);
    controller.move(0, 1);
    expect(camera.position.x).toBeGreaterThan(initialPosition.x);
    expect(controls.target.x).toBeGreaterThan(0);
  });

  it("distinguishes click from drag and disables camera ownership for a brick gesture", () => {
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
    const selected = vi.fn();
    const dragResultXs: number[] = [];
    const interaction = new InteractionController({
      engine,
      renderer,
      camera,
      cameraController,
      element,
      onSelectionChange: selected,
      onHoverChange: vi.fn(),
      onStateChange: vi.fn(),
      onDragResult: (_freeTransform, result) => dragResultXs.push(result.transform.position.x),
      onDragPlaneChange: vi.fn(),
      onMetricsChange: vi.fn(),
      onHistoryChange: vi.fn()
    });

    interaction.pointerDown({ pointerId: 1, clientX: 400, clientY: 300, button: 0 });
    expect(interaction.getState()).toBe("pressed");
    expect(cameraController.enabled).toBe(false);
    interaction.pointerMove({ pointerId: 1, clientX: 403, clientY: 302, button: 0 });
    interaction.pointerUp({ pointerId: 1, clientX: 403, clientY: 302, button: 0 });
    expect(selected).toHaveBeenCalledWith("drag-me");
    expect(interaction.getState()).toBe("idle");
    expect(cameraController.enabled).toBe(true);

    interaction.pointerDown({ pointerId: 2, clientX: 400, clientY: 300, button: 0 });
    interaction.pointerMove({ pointerId: 2, clientX: 420, clientY: 300, button: 0 });
    expect(interaction.getState()).toBe("dragging_brick");
    expect(renderer.dragProxy.mesh.visible).toBe(true);
    interaction.pointerCancel({ pointerId: 2, clientX: 420, clientY: 300, button: 0 });
    expect(interaction.getState()).toBe("idle");
    expect(engine.bricks.get("drag-me").transform.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(renderer.dragProxy.mesh.visible).toBe(false);

    engine.rotateBrick("drag-me", 1, "x");
    renderer.syncFromEngine();
    parent.updateMatrixWorld(true);
    interaction.pointerDown({ pointerId: 3, clientX: 400, clientY: 300, button: 0 });
    interaction.pointerMove({ pointerId: 3, clientX: 450, clientY: 300, button: 0 });
    const beforeReleaseX = dragResultXs.at(-1);
    interaction.pointerUp({ pointerId: 3, clientX: 500, clientY: 300, button: 0 });
    const finalDragX = dragResultXs.at(-1);
    expect(finalDragX).toBeDefined();
    expect(finalDragX).not.toBe(beforeReleaseX);
    expect(engine.bricks.get("drag-me").transform.position.x).toBeCloseTo(finalDragX ?? 0);
    expect(engine.bricks.get("drag-me").transform.position.y).toBeCloseTo(1.4);

    interaction.pointerDown({ pointerId: 4, clientX: 0, clientY: 0, button: 0 });
    expect(selected).toHaveBeenLastCalledWith(undefined);
    interaction.pointerUp({ pointerId: 4, clientX: 0, clientY: 0, button: 0 });

    interaction.dispose();
    renderer.dispose();
  });
});

describe("DragProxy", () => {
  it("owns a visible translucent mesh only during the drag lifecycle", () => {
    const parent = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const proxy = new DragProxy(parent, geometry);
    expect(proxy.mesh.visible).toBe(false);
    proxy.setTransform(transform(1, 2, 3));
    proxy.setInvalid(true);
    proxy.setVisible(true);
    expect(proxy.mesh.visible).toBe(true);
    proxy.setVisible(false);
    proxy.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
