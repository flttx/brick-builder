import type { PartDefinition } from "../../src/index.js";
import type { NormalizedGeometry, RectPartTemplate } from "./asset-types.js";
import type { LDrawMesh } from "./ldraw-parser.js";

export const createStandardGeometry = (part: PartDefinition, lod: 0 | 1): NormalizedGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  appendBox(positions, indices, part.dimensions.width, part.dimensions.height, part.dimensions.depth);
  const segments = lod === 0 ? 20 : 8;
  for (const connector of part.connectors) {
    if (connector.type === "stud") {
      appendCylinder(positions, indices, connector.position.x, connector.position.y + 0.08, connector.position.z, 0.25, 0.16, segments);
    }
  }
  return cleanGeometry({ positions, indices });
};

export const createGeometryFromTemplate = (part: PartDefinition, template: RectPartTemplate, lod: 0 | 1): NormalizedGeometry => {
  if (template.width !== part.dimensions.width || template.depth !== part.dimensions.depth) {
    throw new Error(`Template dimensions do not match ${part.id}`);
  }
  return createStandardGeometry(part, lod);
};

export const normalizeLDrawGeometry = (mesh: LDrawMesh, scale = 1 / 20): NormalizedGeometry => cleanGeometry({
  positions: mesh.positions.map((value) => value * scale),
  indices: [...mesh.indices]
});

export const cleanGeometry = (input: { positions: number[]; indices: number[] }): NormalizedGeometry => {
  const vertexMap = new Map<string, number>();
  const positions: number[] = [];
  const remap: number[] = [];
  for (let sourceIndex = 0; sourceIndex < input.positions.length; sourceIndex += 3) {
    const x = input.positions[sourceIndex] ?? 0;
    const y = input.positions[sourceIndex + 1] ?? 0;
    const z = input.positions[sourceIndex + 2] ?? 0;
    const key = `${x.toFixed(6)}:${y.toFixed(6)}:${z.toFixed(6)}`;
    let targetIndex = vertexMap.get(key);
    if (targetIndex === undefined) {
      targetIndex = positions.length / 3;
      vertexMap.set(key, targetIndex);
      positions.push(x, y, z);
    }
    remap.push(targetIndex);
  }
  const indices: number[] = [];
  const normals = positions.map(() => 0);
  for (let triangle = 0; triangle < input.indices.length; triangle += 3) {
    const a = remap[input.indices[triangle] ?? -1];
    const b = remap[input.indices[triangle + 1] ?? -1];
    const c = remap[input.indices[triangle + 2] ?? -1];
    if (a === undefined || b === undefined || c === undefined || a === b || b === c || a === c) continue;
    const ax = positions[a * 3] ?? 0; const ay = positions[a * 3 + 1] ?? 0; const az = positions[a * 3 + 2] ?? 0;
    const bx = positions[b * 3] ?? 0; const by = positions[b * 3 + 1] ?? 0; const bz = positions[b * 3 + 2] ?? 0;
    const cx = positions[c * 3] ?? 0; const cy = positions[c * 3 + 1] ?? 0; const cz = positions[c * 3 + 2] ?? 0;
    const abx = bx - ax; const aby = by - ay; const abz = bz - az;
    const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
    const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz; const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length <= 1e-8) continue;
    indices.push(a, b, c);
    for (const vertex of [a, b, c]) {
      normals[vertex * 3] = (normals[vertex * 3] ?? 0) + nx / length;
      normals[vertex * 3 + 1] = (normals[vertex * 3 + 1] ?? 0) + ny / length;
      normals[vertex * 3 + 2] = (normals[vertex * 3 + 2] ?? 0) + nz / length;
    }
  }
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const length = Math.hypot(normals[vertex * 3] ?? 0, normals[vertex * 3 + 1] ?? 0, normals[vertex * 3 + 2] ?? 0) || 1;
    normals[vertex * 3] = (normals[vertex * 3] ?? 0) / length;
    normals[vertex * 3 + 1] = (normals[vertex * 3 + 1] ?? 0) / length;
    normals[vertex * 3 + 2] = (normals[vertex * 3 + 2] ?? 0) / length;
  }
  return { positions, normals, indices, bounds: calculateBounds(positions) };
};

const appendBox = (positions: number[], indices: number[], width: number, height: number, depth: number): void => {
  const halfX = width / 2; const halfY = height / 2; const halfZ = depth / 2;
  const faces: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number]]> = [
    [[-halfX, -halfY, halfZ], [halfX, -halfY, halfZ], [halfX, halfY, halfZ], [-halfX, halfY, halfZ]],
    [[halfX, -halfY, -halfZ], [-halfX, -halfY, -halfZ], [-halfX, halfY, -halfZ], [halfX, halfY, -halfZ]],
    [[-halfX, -halfY, -halfZ], [-halfX, -halfY, halfZ], [-halfX, halfY, halfZ], [-halfX, halfY, -halfZ]],
    [[halfX, -halfY, halfZ], [halfX, -halfY, -halfZ], [halfX, halfY, -halfZ], [halfX, halfY, halfZ]],
    [[-halfX, halfY, halfZ], [halfX, halfY, halfZ], [halfX, halfY, -halfZ], [-halfX, halfY, -halfZ]],
    [[-halfX, -halfY, -halfZ], [halfX, -halfY, -halfZ], [halfX, -halfY, halfZ], [-halfX, -halfY, halfZ]]
  ];
  for (const face of faces) {
    const start = positions.length / 3;
    for (const point of face) positions.push(...point);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
};

const appendCylinder = (positions: number[], indices: number[], centerX: number, centerY: number, centerZ: number, radius: number, height: number, segments: number): void => {
  const start = positions.length / 3;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(centerX + Math.cos(angle) * radius, centerY - height / 2, centerZ + Math.sin(angle) * radius);
    positions.push(centerX + Math.cos(angle) * radius, centerY + height / 2, centerZ + Math.sin(angle) * radius);
  }
  const bottom = positions.length / 3;
  positions.push(centerX, centerY - height / 2, centerZ);
  const top = positions.length / 3;
  positions.push(centerX, centerY + height / 2, centerZ);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const a = start + index * 2; const b = start + next * 2; const c = a + 1; const d = b + 1;
    indices.push(a, b, d, a, d, c, bottom, b, a, top, c, d);
  }
};

const calculateBounds = (positions: number[]): NormalizedGeometry["bounds"] => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis] ?? 0;
      min[axis] = Math.min(min[axis] ?? value, value);
      max[axis] = Math.max(max[axis] ?? value, value);
    }
  }
  return { min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0], max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0] };
};
