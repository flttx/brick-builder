import * as THREE from "three";
import type { Transform } from "../../../../../src/index.js";
import { toThreeQuaternion, toThreeVector } from "./three-adapter.js";

export class PlacementProxy {
  public readonly mesh: THREE.Mesh;

  public constructor(public readonly partId: string, parent: THREE.Object3D, geometry: THREE.BufferGeometry) {
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.35,
      metalness: 0.04,
      transparent: true,
      opacity: 0.72,
      emissive: "#161b1e",
      emissiveIntensity: 0.25
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
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(invalid ? "#a93535" : "#161b1e");
    material.emissiveIntensity = invalid ? 0.8 : 0.25;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    (this.mesh.material as THREE.Material).dispose();
  }
}
