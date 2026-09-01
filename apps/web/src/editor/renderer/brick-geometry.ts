import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PartDefinition } from "../../../../../src/index.js";

export const createBrickGeometry = (part: PartDefinition): THREE.BufferGeometry => {
  const pieces: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(part.dimensions.width, part.dimensions.height, part.dimensions.depth)
  ];
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
