import * as THREE from "three";
import type { Transform } from "../../../../../src/index.js";
import { toThreeQuaternion, toThreeVector } from "./three-adapter.js";

export class DragProxy {
  public readonly mesh: THREE.Mesh;

  public constructor(parent: THREE.Object3D, geometry: THREE.BufferGeometry) {
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.35,
        metalness: 0.04,
        transparent: true,
        opacity: 0.86,
        emissive: "#161b1e",
        emissiveIntensity: 0.3
      })
    );
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
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
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    material.color.set(color);
  }

  public setInvalid(invalid: boolean): void {
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(invalid ? "#a93535" : "#161b1e");
    material.emissiveIntensity = invalid ? 0.8 : 0.3;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
