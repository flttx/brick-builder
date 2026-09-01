import * as THREE from "three";
import type { Transform } from "../../../../../src/index.js";
import { createBrickMaterial } from "./brick-material.js";
import { toThreeQuaternion, toThreeVector } from "./three-adapter.js";

export class PlacementProxy {
  public readonly mesh: THREE.Mesh;

  public constructor(public readonly partId: string, parent: THREE.Object3D, geometry: THREE.BufferGeometry) {
    this.mesh = new THREE.Mesh(geometry, createBrickMaterial({
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    }));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);
  }

  public setTransform(transform: Transform): void {
    toThreeVector(transform.position, this.mesh.position);
    toThreeQuaternion(transform.rotation, this.mesh.quaternion);
  }

  public setGeometry(geometry: THREE.BufferGeometry): void {
    this.mesh.geometry = geometry;
  }

  public setColor(color: THREE.ColorRepresentation): void {
    (this.mesh.material as THREE.MeshStandardMaterial).color.set(color);
  }

  public setInvalid(invalid: boolean): void {
    const material = this.mesh.material as THREE.MeshPhysicalMaterial;
    material.emissive.set(invalid ? "#a93535" : "#000000");
    material.emissiveIntensity = invalid ? 0.65 : 0;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    (this.mesh.material as THREE.Material).dispose();
  }
}
