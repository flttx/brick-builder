import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PartDefinition, ProceduralPartVisual } from "../../../../../src/index.js";

export const createBrickGeometry = (part: PartDefinition): THREE.BufferGeometry => {
  const fallbackKind = part.visual?.kind ?? inferSpecialFallbackKind(part);
  const pieces = fallbackKind === undefined
    ? [new THREE.BoxGeometry(part.dimensions.width, part.dimensions.height, part.dimensions.depth)]
    : createSpecialGeometry(part, fallbackKind);
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
  if (part.visual === undefined && fallbackKind !== undefined) {
    scaleFallbackGeometry(geometry, part.dimensions);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

const createSpecialGeometry = (part: PartDefinition, kind: ProceduralPartVisual): THREE.BufferGeometry[] => {
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
  if (kind === "technic_beam") {
    const body = new THREE.BoxGeometry(part.dimensions.width, part.dimensions.height, part.dimensions.depth);
    const holeRings = part.connectors
      .filter((connector) => connector.type === "technic_hole")
      .map((connector) => {
        const ring = new THREE.TorusGeometry(0.22, 0.06, 8, 16);
        ring.rotateY(Math.PI / 2);
        ring.translate(connector.position.x * 1.01, connector.position.y, connector.position.z);
        return ring;
      });
    return [body, ...holeRings];
  }
  if (kind === "technic_pin") {
    const pin = new THREE.CylinderGeometry(0.16, 0.16, 1.55, 16);
    pin.rotateZ(Math.PI / 2);
    const ridgeLeft = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16);
    ridgeLeft.rotateZ(Math.PI / 2);
    ridgeLeft.translate(-0.42, 0, 0);
    const ridgeRight = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16);
    ridgeRight.rotateZ(Math.PI / 2);
    ridgeRight.translate(0.42, 0, 0);
    return [pin, ridgeLeft, ridgeRight];
  }
  if (kind === "technic_bar") {
    const bar = new THREE.CylinderGeometry(0.12, 0.12, part.dimensions.depth, 16);
    bar.rotateX(Math.PI / 2);
    return [bar];
  }
  if (kind === "technic_clip") {
    const jaw = new THREE.TorusGeometry(0.23, 0.08, 8, 16);
    const body = new THREE.BoxGeometry(0.6, 0.5, 0.22);
    body.translate(0, 0, 0.28);
    return [jaw, body];
  }
  if (kind === "generic_special") {
    const shaft = new THREE.CylinderGeometry(0.18, 0.28, 1.3, 12);
    shaft.rotateX(Math.PI / 2);
    const collar = new THREE.TorusGeometry(0.3, 0.08, 8, 16);
    collar.rotateY(Math.PI / 2);
    collar.translate(0, 0, -0.3);
    const tip = new THREE.ConeGeometry(0.32, 0.9, 12);
    tip.rotateX(-Math.PI / 2);
    tip.translate(0, 0, 0.95);
    return [shaft, collar, tip];
  }
  const stem = new THREE.CylinderGeometry(0.065, 0.065, 0.55, 12);
  stem.translate(0, -0.325, 0);
  const leaf = new THREE.SphereGeometry(0.65, 16, 8);
  leaf.scale(0.95, 0.2, 0.62);
  leaf.rotateZ(-0.35);
  leaf.translate(0.1, 0.26, 0);
  return [stem, leaf];
};

const inferSpecialFallbackKind = (part: PartDefinition): ProceduralPartVisual | undefined => {
  if (part.category !== "special") return undefined;
  const ldrawPartId = typeof part.metadata?.ldrawPartId === "string" ? part.metadata.ldrawPartId : "";
  const partKey = `${part.id} ${ldrawPartId}`.toLowerCase();
  if (!partKey.includes("ldraw") && ldrawPartId.length === 0) return undefined;
  if (/(wheel|train-wheel|steering-wheel)/u.test(partKey)) return "wheel";
  if (/(leaf|grass|flower|vine)/u.test(partKey)) return "leaf";
  if (partKey.includes("flag")) return "flagpole";
  return "generic_special";
};

const scaleFallbackGeometry = (geometry: THREE.BufferGeometry, dimensions: PartDefinition["dimensions"]): void => {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox?.getSize(size);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
  geometry.scale(dimensions.width / size.x, dimensions.height / size.y, dimensions.depth / size.z);
};
