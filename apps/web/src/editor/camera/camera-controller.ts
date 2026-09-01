import * as THREE from "three";
import type { BrickEngine } from "../../../../../src/index.js";

export interface BrickCameraController {
  orbit(deltaX: number, deltaY: number): void;
  zoom(delta: number): void;
  focus(brickId: string): void;
  fitProject(): void;
  setEnabled(enabled: boolean): void;
  pan?(deltaX: number, deltaY: number): void;
}

export interface OrbitControlsLike {
  enabled: boolean;
  target: THREE.Vector3;
  update(): void;
}

export class ThreeCameraController implements BrickCameraController {
  private camera: THREE.PerspectiveCamera | undefined;
  private controls: OrbitControlsLike | undefined;
  private readonly defaultPosition = new THREE.Vector3(0, 2.2, 10);

  public constructor(private readonly engine: BrickEngine) {}

  public attach(camera: THREE.PerspectiveCamera, controls: OrbitControlsLike): void {
    this.camera = camera;
    this.controls = controls;
    camera.position.copy(this.defaultPosition);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  public orbit(_deltaX: number, _deltaY: number): void {
    this.controls?.update();
  }

  public pan(deltaX: number, deltaY: number): void {
    const camera = this.requireCamera();
    const controls = this.requireControls();
    const distance = camera.position.distanceTo(controls.target);
    const scale = distance * 0.0015;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-deltaX * scale);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(deltaY * scale);
    const movement = right.add(up);
    camera.position.add(movement);
    controls.target.add(movement);
    controls.update();
  }

  public zoom(delta: number): void {
    const camera = this.requireCamera();
    const controls = this.requireControls();
    const offset = camera.position.clone().sub(controls.target);
    const nextLength = THREE.MathUtils.clamp(offset.length() * (1 + delta), 3, 35);
    camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextLength));
    controls.update();
  }

  public focus(brickId: string): void {
    const camera = this.requireCamera();
    const controls = this.requireControls();
    const brick = this.engine.bricks.get(brickId);
    const offset = camera.position.clone().sub(controls.target);
    controls.target.set(brick.transform.position.x, brick.transform.position.y, brick.transform.position.z);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  public fitProject(): void {
    const camera = this.requireCamera();
    const controls = this.requireControls();
    const bounds = new THREE.Box3();
    for (const brick of this.engine.bricks.values()) {
      const part = this.engine.parts.get(brick.partId);
      const half = new THREE.Vector3(part.dimensions.width / 2, part.dimensions.height / 2, part.dimensions.depth / 2);
      const center = new THREE.Vector3(brick.transform.position.x, brick.transform.position.y, brick.transform.position.z);
      bounds.expandByPoint(center.clone().sub(half));
      bounds.expandByPoint(center.clone().add(half));
    }
    if (bounds.isEmpty()) {
      return;
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(5, size.length() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.25);
    const direction = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    controls.update();
  }

  public setEnabled(enabled: boolean): void {
    if (this.controls !== undefined) {
      this.controls.enabled = enabled;
    }
  }

  private requireCamera(): THREE.PerspectiveCamera {
    if (this.camera === undefined) {
      throw new Error("Camera controller is not attached");
    }
    return this.camera;
  }

  private requireControls(): OrbitControlsLike {
    if (this.controls === undefined) {
      throw new Error("Camera controller is not attached");
    }
    return this.controls;
  }
}
