import * as THREE from "three";
import { colliderWorldAABB, transformPoint } from "../../../../../src/index.js";
import type { BrickEngine } from "../../../../../src/index.js";

const MIN_ZOOM_DISTANCE = 3;
const DEFAULT_CAMERA_DISTANCE = 10;
const MIN_CAMERA_MOVE_SCALE = 0.75;
const MAX_CAMERA_MOVE_SCALE = 8;

export interface BrickCameraController {
  orbit(deltaX: number, deltaY: number): void;
  zoom(delta: number): void;
  focus(brickId: string): void;
  fitProject(): void;
  setEnabled(enabled: boolean): void;
  move?(forward: number, right: number): void;
  pan?(deltaX: number, deltaY: number): void;
}

export interface OrbitControlsLike {
  enabled: boolean;
  target: THREE.Vector3;
  update(): void;
  maxDistance?: number;
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

  public move(forwardDistance: number, rightDistance: number): void {
    const camera = this.requireCamera();
    const controls = this.requireControls();
    const forward = controls.target.clone().sub(camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const moveScale = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / DEFAULT_CAMERA_DISTANCE, MIN_CAMERA_MOVE_SCALE, MAX_CAMERA_MOVE_SCALE);
    const movement = forward.multiplyScalar(forwardDistance * moveScale).add(right.multiplyScalar(rightDistance * moveScale));
    camera.position.add(movement);
    controls.target.add(movement);
    controls.update();
  }

  public zoom(delta: number): void {
    const camera = this.requireCamera();
    const controls = this.requireControls();
    const offset = camera.position.clone().sub(controls.target);
    const maxDistance = controls.maxDistance ?? Number.POSITIVE_INFINITY;
    const nextLength = Math.max(MIN_ZOOM_DISTANCE, Math.min(maxDistance, offset.length() * (1 + delta)));
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
    const bounds = calculateProjectBounds(this.engine);
    if (bounds.isEmpty()) {
      return;
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = size.length() / 2;
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.1));
    const distance = Math.max(
      5,
      radius / Math.tan(verticalHalfFov),
      size.x / (2 * Math.tan(horizontalHalfFov)),
      size.y / (2 * Math.tan(verticalHalfFov)),
      size.z / 2
    ) * 1.25;
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
    else direction.normalize();
    controls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    if (controls.maxDistance !== undefined && Number.isFinite(controls.maxDistance)) controls.maxDistance = Math.max(controls.maxDistance, distance * 1.1);
    const requiredFar = distance + radius + 10;
    if (camera.far < requiredFar) {
      camera.far = requiredFar;
      camera.updateProjectionMatrix();
    }
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

export const calculateProjectBounds = (engine: BrickEngine): THREE.Box3 => {
  const bounds = new THREE.Box3();
  for (const brick of engine.bricks.values()) {
    const part = engine.parts.get(brick.partId);
    for (const collider of part.colliders) {
      const colliderBounds = colliderWorldAABB(collider, brick.transform);
      bounds.expandByPoint(new THREE.Vector3(colliderBounds.min.x, colliderBounds.min.y, colliderBounds.min.z));
      bounds.expandByPoint(new THREE.Vector3(colliderBounds.max.x, colliderBounds.max.y, colliderBounds.max.z));
    }
    for (const connector of part.connectors) {
      const point = transformPoint(brick.transform, connector.position);
      bounds.expandByPoint(new THREE.Vector3(point.x, point.y, point.z));
    }
    if (part.colliders.length === 0) {
      const half = new THREE.Vector3(part.dimensions.width / 2, part.dimensions.height / 2, part.dimensions.depth / 2);
      const center = new THREE.Vector3(brick.transform.position.x, brick.transform.position.y, brick.transform.position.z);
      bounds.expandByPoint(center.clone().sub(half));
      bounds.expandByPoint(center.clone().add(half));
    }
  }
  return bounds;
};
