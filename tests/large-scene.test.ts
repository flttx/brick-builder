import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BrickEngine, createStandardPartDefinitions, identity, yRotationQuarter } from "../src/index.js";
import { validatePartDefinition } from "../src/parts/part-validation.js";
import { calculateProjectBounds, ThreeCameraController } from "../apps/web/src/editor/camera/camera-controller.js";
import { BrickPicker } from "../apps/web/src/editor/interaction/picker.js";
import { ThreeBrickRenderer } from "../apps/web/src/editor/renderer/brick-renderer.js";
import { createBrickGeometry } from "../apps/web/src/editor/renderer/brick-geometry.js";

const transform = (x = 0, y = 0, z = 0, rotation = identity()) => ({ position: { x, y, z }, rotation });

describe("large-scene camera bounds", () => {
  it("fits rotated collider envelopes instead of unrotated dimensions", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "axle", partId: "technic-axle-4", transform: transform(3, 0, -2, yRotationQuarter(1)) });
    const bounds = calculateProjectBounds(engine);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const controls = { enabled: true, target: new THREE.Vector3(), maxDistance: 5, update: () => undefined };
    const controller = new ThreeCameraController(engine);
    controller.attach(camera, controls);
    controller.fitProject();

    expect(controls.target.x).toBeCloseTo(bounds.getCenter(new THREE.Vector3()).x);
    expect(controls.target.z).toBeCloseTo(bounds.getCenter(new THREE.Vector3()).z);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(5);
    expect(controls.maxDistance).toBeGreaterThan(5);
  });

  it("fits projects that exceed the default camera distance", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "left", partId: "brick-2x4", transform: transform(-20_000) });
    engine.createBrick({ id: "right", partId: "brick-2x4", transform: transform(20_000) });
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20_000);
    const controls = { enabled: true, target: new THREE.Vector3(), maxDistance: 10_000, update: () => undefined };
    const controller = new ThreeCameraController(engine);
    controller.attach(camera, controls);
    controller.fitProject();

    const distance = camera.position.distanceTo(controls.target);
    expect(distance).toBeGreaterThan(10_000);
    expect(controls.maxDistance).toBeGreaterThan(distance);
    expect(camera.far).toBeGreaterThan(distance);
  });

  it("scales keyboard movement with camera distance", () => {
    const controller = new ThreeCameraController(new BrickEngine());
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const controls = { enabled: true, target: new THREE.Vector3(), update: () => undefined };
    controller.attach(camera, controls);
    const nearTarget = controls.target.clone();
    controller.move(1, 0);
    const nearDistance = controls.target.distanceTo(nearTarget);
    controller.zoom(5);
    const farTarget = controls.target.clone();
    controller.move(1, 0);
    const farDistance = controls.target.distanceTo(farTarget);

    expect(farDistance).toBeGreaterThan(nearDistance);
  });
});

describe("large-scene instance visibility", () => {
  it("culls off-screen instances while preserving picking and protected selection", () => {
    const engine = new BrickEngine();
    engine.createBrick({ id: "inside", partId: "brick-2x4", transform: transform() });
    engine.createBrick({ id: "outside", partId: "brick-2x4", transform: transform(100, 0, 0) });
    const parent = new THREE.Group();
    const renderer = new ThreeBrickRenderer(parent, engine, 4);
    renderer.syncFromEngine();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    renderer.refreshVisibility(camera, true);

    expect(renderer.getVisibleInstanceCount()).toBe(1);
    const batch = renderer.batches.get("brick-2x4");
    if (batch === undefined) throw new Error("Brick batch was not created");
    const updatedColor = new THREE.Color();
    renderer.updateColor("inside", "red");
    batch.mesh.getColorAt(0, updatedColor);
    expect(updatedColor.getHexString()).toBe(new THREE.Color(engine.colors.get("red").baseColor).getHexString());
    parent.updateMatrixWorld(true);
    const element = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLElement;
    const picker = new BrickPicker(renderer, element);
    expect(picker.pick(400, 300, camera)?.brickId).toBe("inside");

    const outsideCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    outsideCamera.position.set(100, 4, 8);
    outsideCamera.lookAt(100, 0, 0);
    outsideCamera.updateMatrixWorld(true);
    expect(picker.pick(400, 300, outsideCamera)).toBeUndefined();
    renderer.refreshVisibility(outsideCamera, true);
    expect(picker.pick(400, 300, outsideCamera)?.brickId).toBe("outside");

    renderer.setSelected("outside");
    renderer.refreshVisibility(camera, true);
    expect(renderer.getVisibleInstanceCount()).toBe(2);
    renderer.refreshVisibility(camera, false);
    expect(renderer.getVisibleInstanceCount()).toBe(2);
    renderer.dispose();
  });
});

describe("procedural part dimensions", () => {
  it("keeps generated gameplay envelopes valid and prevents visual overflow", () => {
    for (const part of createStandardPartDefinitions().filter((candidate) => candidate.visual !== undefined)) {
      expect(validatePartDefinition(part), part.id).toEqual([]);
      const geometry = createBrickGeometry(part);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds === null) throw new Error(`Missing bounds for ${part.id}`);
      const actual = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
      const expected = [part.dimensions.width, part.dimensions.height, part.dimensions.depth];
      expect(actual.every((value, index) => value <= (expected[index] ?? 0) + 0.25), part.id).toBe(true);
      geometry.dispose();
    }
  });
});
