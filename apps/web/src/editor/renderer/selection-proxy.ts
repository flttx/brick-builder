import * as THREE from "three";
import type { Transform } from "../../../../../src/index.js";
import { toThreeQuaternion, toThreeVector } from "./three-adapter.js";

export class SelectionProxy {
  public readonly mesh: THREE.LineSegments;

  public constructor(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color = "#f6c453") {
    this.mesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 32),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false })
    );
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  public setTransform(transform: Transform): void {
    toThreeVector(transform.position, this.mesh.position);
    toThreeQuaternion(transform.rotation, this.mesh.quaternion);
    this.mesh.scale.setScalar(1.025);
  }

  public setGeometry(geometry: THREE.BufferGeometry): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.EdgesGeometry(geometry);
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      for (const material of this.mesh.material) {
        material.dispose();
      }
    } else {
      this.mesh.material.dispose();
    }
  }
}
