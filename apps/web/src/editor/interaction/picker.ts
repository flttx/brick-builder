import * as THREE from "three";
import type { ThreeBrickRenderer } from "../renderer/brick-renderer.js";

export interface PickResult {
  brickId: string;
  instanceId: number;
  point: THREE.Vector3;
  object: THREE.Object3D;
}

export class BrickPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  public constructor(private readonly renderer: ThreeBrickRenderer, private readonly element: HTMLElement) {}

  public pick(clientX: number, clientY: number, camera: THREE.Camera, excludedBrickId?: string): PickResult | undefined {
    const rect = this.element.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, camera);
    const intersections = this.raycaster.intersectObjects(this.renderer.getPickableObjects(), false);
    const intersection = intersections.find((candidate) => {
      if (candidate.instanceId === undefined) {
        return false;
      }
      return this.renderer.getBrickIdFromIntersection(candidate) !== excludedBrickId;
    });
    if (intersection === undefined || intersection.instanceId === undefined) {
      return undefined;
    }
    const brickId = this.renderer.getBrickIdFromIntersection(intersection);
    if (brickId === undefined) {
      return undefined;
    }
    return {
      brickId,
      instanceId: intersection.instanceId,
      point: intersection.point.clone(),
      object: intersection.object
    };
  }

  public getPointerNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.element.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }
}
