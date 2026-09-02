import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PartDefinition } from "../../../../../src/index.js";

export const createBrickGeometry = (part: PartDefinition): THREE.BufferGeometry => {
  const pieces = part.visual === undefined
    ? [new THREE.BoxGeometry(part.dimensions.width, part.dimensions.height, part.dimensions.depth)]
    : createSpecialGeometry(part);
  for (const connector of part.connectors) {
    if (connector.type !== "stud") {
      continue;
    }
    const stud = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 20);
    stud.translate(connector.position.x, connector.position.y + 0.08, connector.position.z);
    pieces.push(stud);
  }
  const geometry = mergeGeometries(pieces, false);
  for (const piece of pieces) {
    piece.dispose();
  }
  if (geometry === null) {
    throw new Error(`Unable to build geometry for part ${part.id}`);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

const createSpecialGeometry = (part: PartDefinition): THREE.BufferGeometry[] => {
  const kind = part.visual?.kind;
  if (kind === undefined) {
    return [];
  }
  if (kind === "wheel") {
    const tire = new THREE.TorusGeometry(0.43, 0.14, 12, 24);
    const hub = new THREE.CylinderGeometry(0.19, 0.19, 0.42, 16);
    hub.rotateX(Math.PI / 2);
    return [tire, hub];
  }
  if (kind === "flagpole") {
    const base = new THREE.CylinderGeometry(0.48, 0.48, 0.18, 20);
    base.translate(0, -0.51, 0);
    const pole = new THREE.CylinderGeometry(0.07, 0.07, 3.05, 16);
    pole.translate(0, 0.97, 0);
    const flag = new THREE.BoxGeometry(0.58, 0.62, 0.06);
    flag.translate(0.29, 1.95, 0);
    return [base, pole, flag];
  }
  if (kind === "technic_axle") {
    return part.colliders.map((collider) => {
      const geometry = new THREE.BoxGeometry(collider.size.x, collider.size.y, collider.size.z);
      geometry.translate(collider.center.x, collider.center.y, collider.center.z);
      return geometry;
    });
  }
  const stem = new THREE.CylinderGeometry(0.065, 0.065, 0.55, 12);
  stem.translate(0, -0.325, 0);
  const leaf = new THREE.SphereGeometry(0.65, 16, 8);
  leaf.scale(0.95, 0.2, 0.62);
  leaf.rotateZ(-0.35);
  leaf.translate(0.1, 0.26, 0);
  return [stem, leaf];
};
